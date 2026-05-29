from __future__ import annotations

import json
import os
import urllib.request
import xml.etree.ElementTree as ET
from functools import lru_cache
from typing import Any

SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
SEC_SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik}.json"
SEC_ARCHIVES_URL = "https://www.sec.gov/Archives/edgar/data/{cik_int}/{accession}/{document}"


def _user_agent() -> str:
    return os.getenv("SEC_USER_AGENT", "stonk-research local app contact@example.com")


def _request(url: str) -> bytes:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json, application/xml, text/xml, */*",
            "User-Agent": _user_agent(),
        },
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return response.read()


def _get_json(url: str) -> Any:
    return json.loads(_request(url).decode("utf-8"))


def _get_text(url: str) -> str:
    return _request(url).decode("utf-8", errors="replace")


@lru_cache(maxsize=1)
def _ticker_map() -> dict[str, dict[str, Any]]:
    payload = _get_json(SEC_TICKERS_URL)
    return {str(item["ticker"]).upper(): item for item in payload.values()}


def resolve_cik(ticker: str) -> tuple[str, str]:
    symbol = ticker.upper().replace("-", ".")
    item = _ticker_map().get(symbol)
    if not item:
        raise ValueError(f"No SEC CIK found for {ticker}")
    return f"{int(item['cik_str']):010d}", str(item.get("title") or symbol)


def _child_text(node: ET.Element, path: str) -> str | None:
    found = node.find(path)
    if found is None or found.text is None:
        return None
    value = found.text.strip()
    return value or None


def _number(value: str | None) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value.replace(",", ""))
    except ValueError:
        return None


def _parse_form4(xml_text: str, filing: dict[str, str]) -> list[dict[str, Any]]:
    root = ET.fromstring(xml_text)
    owner = _child_text(root, ".//rptOwnerName") or "Unknown insider"
    relationship = {
        "director": _child_text(root, ".//isDirector"),
        "officer": _child_text(root, ".//isOfficer"),
        "tenPercentOwner": _child_text(root, ".//isTenPercentOwner"),
        "other": _child_text(root, ".//isOther"),
        "officerTitle": _child_text(root, ".//officerTitle"),
    }

    transactions: list[dict[str, Any]] = []
    for node in root.findall(".//nonDerivativeTransaction"):
        code = _child_text(node, ".//transactionCode")
        shares = _number(_child_text(node, ".//transactionShares/value"))
        price = _number(_child_text(node, ".//transactionPricePerShare/value"))
        owned_after = _number(_child_text(node, ".//sharesOwnedFollowingTransaction/value"))
        value = shares * price if shares is not None and price is not None else None
        transactions.append(
            {
                "owner": owner,
                "relationship": relationship,
                "date": _child_text(node, ".//transactionDate/value") or filing["reportDate"],
                "code": code,
                "shares": shares,
                "price": price,
                "value": value,
                "sharesOwnedAfter": owned_after,
                "filingDate": filing["filingDate"],
                "accessionNumber": filing["accessionNumber"],
            }
        )
    return transactions


def fetch_insider_activity(ticker: str, limit: int = 12) -> dict[str, Any]:
    cik, company = resolve_cik(ticker)
    submissions = _get_json(SEC_SUBMISSIONS_URL.format(cik=cik))
    recent = submissions.get("filings", {}).get("recent", {})
    forms = recent.get("form", [])
    accessions = recent.get("accessionNumber", [])
    filing_dates = recent.get("filingDate", [])
    report_dates = recent.get("reportDate", [])
    documents = recent.get("primaryDocument", [])

    filings: list[dict[str, str]] = []
    for form, accession, filing_date, report_date, document in zip(
        forms, accessions, filing_dates, report_dates, documents
    ):
        if form not in {"4", "4/A"}:
            continue
        filings.append(
            {
                "form": form,
                "accessionNumber": accession,
                "filingDate": filing_date,
                "reportDate": report_date or filing_date,
                "document": document,
            }
        )
        if len(filings) >= limit:
            break

    cik_int = str(int(cik))
    transactions: list[dict[str, Any]] = []
    for filing in filings:
        accession_path = filing["accessionNumber"].replace("-", "")
        url = SEC_ARCHIVES_URL.format(
            cik_int=cik_int,
            accession=accession_path,
            document=filing["document"],
        )
        try:
            transactions.extend(_parse_form4(_get_text(url), filing))
        except Exception:
            continue

    purchase_value = sum(t["value"] or 0 for t in transactions if t.get("code") == "P")
    sale_value = sum(t["value"] or 0 for t in transactions if t.get("code") == "S")
    return {
        "ticker": ticker.upper(),
        "company": company,
        "cik": cik,
        "source": "SEC EDGAR Forms 4/4A",
        "filingCount": len(filings),
        "transactionCount": len(transactions),
        "purchaseValue": purchase_value,
        "saleValue": sale_value,
        "netValue": purchase_value - sale_value,
        "latestFilingDate": filings[0]["filingDate"] if filings else None,
        "transactions": transactions[:50],
    }
