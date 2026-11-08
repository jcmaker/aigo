"""analyses 구간 자르기: trim_start, trim_end 추가

Revision ID: 0004
Revises: 0003
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = '0004'
down_revision: Union[str, Sequence[str], None] = '0003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('analyses', sa.Column('trim_start', sa.Float(), nullable=True))
    op.add_column('analyses', sa.Column('trim_end', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('analyses', 'trim_end')
    op.drop_column('analyses', 'trim_start')
