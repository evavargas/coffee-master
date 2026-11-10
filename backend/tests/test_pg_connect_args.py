from app.db.session import pg_connect_args


def test_sqlite_allows_cross_thread_use() -> None:
    assert pg_connect_args("sqlite:///./x.db") == {"check_same_thread": False}


def test_postgresql_disables_prepared_statements() -> None:
    assert pg_connect_args("postgresql+psycopg://u:p@localhost:5432/x") == {"prepare_threshold": None}
