from app.agent.knowledge import load_coffee_knowledge


def test_knowledge_loads_documents_from_subfolders():
    text = load_coffee_knowledge()
    assert "## Document: 03-espresso-y-bebidas.md" in text
    assert "## Document: recetario/12-prensa-francesa.md" in text


def test_knowledge_excludes_raw_sources():
    text = load_coffee_knowledge()
    assert "_fuentes" not in text
    assert "recipes.md" not in text


def test_health_endpoint(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def _load_from(tmp_path, monkeypatch, files: dict[str, str]) -> str:
    import app.agent.knowledge as knowledge

    for name, content in files.items():
        (tmp_path / name).write_text(content, encoding="utf-8")
    monkeypatch.setattr(knowledge, "KNOWLEDGE_DIR", tmp_path)
    knowledge.load_coffee_knowledge.cache_clear()
    try:
        return knowledge.load_coffee_knowledge()
    finally:
        knowledge.load_coffee_knowledge.cache_clear()


def test_frontmatter_is_stripped_and_validated_has_no_estado(tmp_path, monkeypatch):
    text = _load_from(tmp_path, monkeypatch, {"a.md": "---\ntype: guide\ntitle: T\n---\nHello"})
    assert text == "## Document: a.md\n\nHello"


def test_testing_and_not_recommended_get_estado_line(tmp_path, monkeypatch):
    text = _load_from(tmp_path, monkeypatch, {
        "a.md": "---\ntype: guide\ntitle: A\nstatus: testing\n---\nAAA",
        "b.md": "---\ntype: guide\ntitle: B\nstatus: not_recommended\n---\nBBB",
    })
    assert "## Document: a.md\nEstado: en prueba, no recomendar como validada\n\nAAA" in text
    assert "## Document: b.md\nEstado: no recomendada, no la sugieras\n\nBBB" in text


def test_malformed_frontmatter_does_not_raise(tmp_path, monkeypatch):
    text = _load_from(tmp_path, monkeypatch, {
        "bad.md": "---\na: [unclosed\n---\nBody",
        "ok.md": "plain",
    })
    assert text.count("## Document:") == 2
    assert "Body" in text


def test_bom_testing_file_keeps_estado_and_hides_yaml(tmp_path, monkeypatch):
    text = _load_from(tmp_path, monkeypatch, {"a.md": "\ufeff---\ntype: guide\ntitle: T\nstatus: testing\n---\nBody"})
    assert "Estado: en prueba, no recomendar como validada" in text
    assert "type: guide" not in text and "Body" in text


def test_malformed_yaml_gets_conservative_estado_and_hides_yaml(tmp_path, monkeypatch):
    text = _load_from(tmp_path, monkeypatch, {"a.md": "---\nsecret_key: [unclosed\n---\nBody"})
    assert text == "## Document: a.md\nEstado: sin verificar, no recomendar como validada\n\nBody"


def test_invalid_date_does_not_raise(tmp_path, monkeypatch):
    text = _load_from(tmp_path, monkeypatch, {"a.md": "---\nd: 2023-99-99\n---\nBody"})
    assert "Estado: sin verificar" in text and "2023-99-99" not in text
