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
