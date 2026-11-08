"""분석 출처 analyses.source 추가 (upload, dashpi)

Revision ID: 0006
Revises: 0005
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = '0006'
down_revision: Union[str, Sequence[str], None] = '0005'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('analyses', sa.Column('source', sa.String(10), nullable=False, server_default='upload'))


def downgrade() -> None:
    op.drop_column('analyses', 'source')
