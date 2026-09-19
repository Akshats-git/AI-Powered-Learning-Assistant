# RAG eval — provider: fake

100 questions over 5 documents (synthetic gold set — see e2e/evals/README.md for what it does and does not show).

| Slice | Qs | Retrieval hit | Exact page | Citation precision | Answer contains | Refuses unanswerable | Avg sources | p95 ms |
|---|---|---|---|---|---|---|---|---|
| **overall** | 100 | 100.0% | 100.0% | 86.7% | 100.0% | 0.0% | 1.5 | 30.0 |
| numeric | 25 | 100.0% | 100.0% | 86.7% | 100.0% | n/a | 1.4 | 36.0 |
| who | 25 | 100.0% | 100.0% | 86.7% | 100.0% | n/a | 1.4 | 29.0 |
| when | 25 | 100.0% | 100.0% | 86.7% | 100.0% | n/a | 1.4 | 29.0 |
| unanswerable | 25 | n/a | n/a | n/a | n/a | 0.0% | 1.9 | 30.0 |

- **Retrieval hit** — some cited source covers the page holding the answer.
- **Exact page** — the top source's `snippetPage` is that page.
- **Citation precision** — share of cited sources that cover the answer's page.
- **Answer contains** — the reply includes the expected fact.
- **Refuses unanswerable** — for questions the document does not answer, the reply says so. (Not gated with the fake provider, which always answers from the best excerpt.)
