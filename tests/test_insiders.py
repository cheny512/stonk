from market_predictor.insiders import _parse_form4


def test_parse_form4_non_derivative_purchase():
    xml = """
    <ownershipDocument>
      <reportingOwner>
        <reportingOwnerId>
          <rptOwnerName>Jane Trader</rptOwnerName>
        </reportingOwnerId>
        <reportingOwnerRelationship>
          <isDirector>1</isDirector>
          <isOfficer>1</isOfficer>
          <officerTitle>Chief Financial Officer</officerTitle>
        </reportingOwnerRelationship>
      </reportingOwner>
      <nonDerivativeTable>
        <nonDerivativeTransaction>
          <transactionDate><value>2026-05-20</value></transactionDate>
          <transactionCoding><transactionCode>P</transactionCode></transactionCoding>
          <transactionAmounts>
            <transactionShares><value>100</value></transactionShares>
            <transactionPricePerShare><value>12.50</value></transactionPricePerShare>
          </transactionAmounts>
          <postTransactionAmounts>
            <sharesOwnedFollowingTransaction><value>900</value></sharesOwnedFollowingTransaction>
          </postTransactionAmounts>
        </nonDerivativeTransaction>
      </nonDerivativeTable>
    </ownershipDocument>
    """
    filing = {
        "filingDate": "2026-05-21",
        "reportDate": "2026-05-20",
        "accessionNumber": "0000000000-26-000001",
    }

    transactions = _parse_form4(xml, filing)

    assert transactions == [
        {
            "owner": "Jane Trader",
            "relationship": {
                "director": "1",
                "officer": "1",
                "tenPercentOwner": None,
                "other": None,
                "officerTitle": "Chief Financial Officer",
            },
            "date": "2026-05-20",
            "code": "P",
            "shares": 100.0,
            "price": 12.5,
            "value": 1250.0,
            "sharesOwnedAfter": 900.0,
            "filingDate": "2026-05-21",
            "accessionNumber": "0000000000-26-000001",
        }
    ]
