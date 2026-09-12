PYTHON ?= python3.12

.PHONY: backend frontend install test download-model

install:
	$(PYTHON) -m venv backend/.venv
	backend/.venv/bin/pip install -r backend/requirements.txt
	cd frontend && npm install

download-model:
	backend/.venv/bin/python backend/scripts/download_model.py

backend:
	backend/.venv/bin/uvicorn backend.main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

test:
	backend/.venv/bin/pytest -c backend/pytest.ini backend/tests
	cd frontend && npm test
