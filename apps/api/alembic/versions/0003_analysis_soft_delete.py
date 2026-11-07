"""analyses 소프트 삭제: deleted_at 추가, user_id nullable + ON DELETE SET NULL

Revision ID: 0003
Revises: 0002
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = '0003'
down_revision: Union[str, Sequence[str], None] = '0002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('analyses', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))
    op.alter_column('analyses', 'user_id', existing_type=sa.Integer(), nullable=True)
    op.drop_constraint('analyses_user_id_fkey', 'analyses', type_='foreignkey')
    op.create_foreign_key('analyses_user_id_fkey', 'analyses', 'users', ['user_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    op.execute('DELETE FROM analyses WHERE user_id IS NULL')
    op.drop_constraint('analyses_user_id_fkey', 'analyses', type_='foreignkey')
    op.create_foreign_key('analyses_user_id_fkey', 'analyses', 'users', ['user_id'], ['id'])
    op.alter_column('analyses', 'user_id', existing_type=sa.Integer(), nullable=False)
    op.drop_column('analyses', 'deleted_at')
