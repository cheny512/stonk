"""initial

Revision ID: 0001
Revises: 
Create Date: 2026-06-12 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.create_table(
        'tickers',
        sa.Column('symbol', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=True),
        sa.Column('sector', sa.String(), nullable=True),
        sa.Column('first_seen', sa.Date(), nullable=True),
        sa.Column('last_seen', sa.Date(), nullable=True),
        sa.PrimaryKeyConstraint('symbol')
    )
    op.create_table(
        'price_bars',
        sa.Column('symbol', sa.String(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('open', sa.Float(), nullable=False),
        sa.Column('high', sa.Float(), nullable=False),
        sa.Column('low', sa.Float(), nullable=False),
        sa.Column('close', sa.Float(), nullable=False),
        sa.Column('volume', sa.BigInteger(), nullable=False),
        sa.PrimaryKeyConstraint('symbol', 'date')
    )
    op.create_table(
        'training_runs',
        sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
        sa.Column('started_at', sa.DateTime(), nullable=False),
        sa.Column('finished_at', sa.DateTime(), nullable=True),
        sa.Column('model_kind', sa.String(), nullable=False),
        sa.Column('hit_rate', sa.Float(), nullable=True),
        sa.Column('brier', sa.Float(), nullable=True),
        sa.Column('settings_json', sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_table(
        'backtest_runs',
        sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
        sa.Column('run_at', sa.DateTime(), nullable=False),
        sa.Column('horizon', sa.Integer(), nullable=False),
        sa.Column('confidence', sa.Float(), nullable=False),
        sa.Column('trade_cost', sa.Float(), nullable=False),
        sa.Column('n_trades', sa.Integer(), nullable=False),
        sa.Column('total_return', sa.Float(), nullable=True),
        sa.Column('max_drawdown', sa.Float(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_table(
        'trades',
        sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
        sa.Column('backtest_id', sa.Integer(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('ticker', sa.String(), nullable=False),
        sa.Column('side', sa.String(), nullable=False),
        sa.Column('prob_up', sa.Float(), nullable=False),
        sa.Column('expected_return', sa.Float(), nullable=False),
        sa.Column('realized', sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(['backtest_id'], ['backtest_runs.id'], ),
        sa.PrimaryKeyConstraint('id')
    )

def downgrade() -> None:
    op.drop_table('trades')
    op.drop_table('backtest_runs')
    op.drop_table('training_runs')
    op.drop_table('price_bars')
    op.drop_table('tickers')
