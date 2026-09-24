---
title: What LoCoMo Actually Tells Us About Arachne Memory
date: 2026-07-27
author: Arachne Research
summary: >
  We ran Arachne’s registered long-horizon memory path on the LoCoMo10
  benchmark under a fixed speech model. Memory helps—clearly—but the gap to
  perfect evidence shows retrieval, not the mouth, is still the main bottleneck.
tags:
  - memory
  - evaluation
  - LoCoMo
  - ALME-2
---

# What LoCoMo Actually Tells Us About Arachne Memory

*A narrow probe of sealed episodic retrieval—not a verdict on the whole organism.*

When people ask whether Arachne’s memory “works,” they often mean something broad: does the system remember? Can it hold a long conversation? Is it better than stuffing the whole transcript into a context window?

Those are fair questions. They are not what we measured.

What we measured is more precise—and, for a research organism, more useful:

> **If we freeze writing, freeze tools, and freeze the speech policy, does Arachne’s recall path surface the right public episodic material for long-horizon dialog QA?**

That is ALME-2’s light-lane LoCoMo evaluation. Below is what the design means, what we observed with Grok 4.3 as the speech centre, and what claims those numbers can and cannot support.

---

## The short version

On the registered LoCoMo10 set (1,986 questions), with the same model and the same prompt:

| Lane | What the model sees | Overall F1 |
|------|---------------------|------------|
| **No memory** | No evidence | **0.228** |
| **Arachne** | Top-5 BM25 memory records | **0.409** |
| **Gold evidence** | Oracle dialog turns only | **0.542** |

So:

1. **Memory is useful.** Arachne’s retrieval path lifts answer quality far above the no-evidence floor (+0.18 F1).
2. **Memory is not yet perfect retrieval.** Gold evidence—the same mouth, perfect passages—still sits higher (+0.13 F1 over Arachne).
3. **The main gap is recall packaging, not “can the model answer.”** When the right turns are present, speech does real work; when they are missing, it mostly abstains.

Separately, sealed retrieval recall (fraction of oracle evidence IDs recovered in the top-k set) is **0.475** on 1,982 scored questions. That lines up with the answer gap.

This is research evidence for a **read path** under a fixed mouth—not a four-lane `VALID` seal, and not a claim that the full multi-agent organism is “done.”

---

## What we built the probe to isolate

Arachne is a whole organism: contract-net coordination, allostasis, governance, Silk agents, optional self-rewrite. LoCoMo light deliberately **does not** score all of that at once.

It freezes everything except evidence selection:

| Held constant | Varies by lane |
|---------------|----------------|
| Speech model (here: Grok 4.3) | Evidence block in the user message |
| System prompt and decoding | — |
| Question set and order | — |
| No tools, no writes, no ranking by the LLM | — |

The speech centre is instructed to answer **only** from supplied evidence, in a short phrase, or to say exactly `No information available.` Evidence is treated as untrusted data, never as instructions.

That turns long-horizon memory into a **comparable experimental arm**, not a vibe.

---

## Four lanes, three of them “light”

| Lane | Evidence supplied | Role |
|------|-------------------|------|
| `no_memory` | None | **Floor.** Abstention without retrieval; checks that the model is not smuggling dialog from weights. |
| `arachne` | Arachne’s registered BM25 top-5 | **The memory system under test.** |
| `gold_evidence` | Oracle-selected public turns (IDs stripped) | **Ceiling for perfect evidence selection** with the same speech policy. |
| `model_only` | Full chronological public conversation | Full-context baseline (expensive; not required for light research metrics). |

The claim structure is the inequality:

```text
no_memory  ≤  arachne  ≤  gold_evidence  (≤ model_only, if run)
```

- **Arachne − no_memory** ≈ value of the memory path.  
- **Gold − arachne** ≈ cost of imperfect ranking / coverage / packaging.  
- **1 − gold** ≈ residual speech, prompt, and metric limits even with perfect evidence.

---

## What “Arachne memory” means *in this eval*

At prepare time we build a **public-only** corpus into Arachne’s memory stack (`alme-2-locomo-retrieval`), seal ranked queries, and record restart and safety evidence.

For each question in the `arachne` lane:

1. Query the memory index with the question text under the registered policy (`arachne.memory_retrieval.bm25.v1`).
2. Take the **top five** ranked recallable records (field-weighted BM25 over structured episodic/dialog material).
3. Serialize those records as evidence in the fixed speech request.
4. Score the short answer string against the LoCoMo oracle.

Also sealed or checked on the full pipeline:

- **Restart equivalence** — rebuild is deterministic across session cut points.  
- **Safety** — public corpus only during retrieval; no provider writes on the memory path; protected mutation counters.  
- **Temporal discipline** — retrieval must not leak future material relative to the sealed visibility frontier.

So we are measuring:

**In scope**

- Offline/online **read path**: index → rank → top-k → speech  
- **What becomes a recallable record** from public dialog  
- **Top-k usefulness** under a frozen speech policy  
- **Abstention** when evidence is empty or weak  
- Deterministic, auditable memory ops  

**Out of scope**

- Multi-agent CNP, tools, self-rewrite  
- Learned dense retrieval (this registered policy is lexical BM25)  
- Open-ended chat quality  
- Parametric knowledge (mostly blocked by the prompt)  
- Live organism adaptation *during* the QA loop  

In one line: **Arachne F1 ≈ speech(retrieve(q))** — not “the whole spider in the wild.”

---

## How scoring works

### Answer quality

LoCoMo-style token F1 after normalization and stemming, with category-specific rules:

| Category | n | Role (task shape) | Scoring sketch |
|----------|--:|-------------------|----------------|
| 1 | 282 | Multi-part / multi-hop style | Average of best F1 per gold comma-separated part |
| 2 | 321 | Temporal (“when…”) | Token F1 |
| 3 | 96 | Open / multi-field | F1 on the primary gold segment |
| 4 | 841 | Single-hop factoid | Token F1 |
| 5 | 446 | Adversarial / unanswerable | 1.0 iff the model abstains with the registered NIA phrasing |

Overall F1 is the mean over all questions. It mixes retrieval success, extraction skill, and abstention discipline.

### Retrieval quality (separate)

For each question with non-empty oracle evidence, we compute the fraction of **oracle evidence IDs** present in Arachne’s top-k retrieval set, then average:

- **Retrieval recall: 0.475** (1,982 questions; 4 excluded)

That number does not depend on the speech model. It is a pure memory-index metric.

---

## Results (Grok 4.3 speech centre)

### Overall

| Lane | Overall F1 | NIA rate (approx.) | Mean prompt tokens |
|------|------------:|-------------------:|-------------------:|
| No memory | 0.228 | 100% | ~300 |
| Arachne | 0.409 | ~64% | ~650 |
| Gold evidence | 0.542 | ~45% | ~400 |

Speech model identity was stable (`grok-4.3`); we observed no think-tag leakage into scored answers.

### By category

| Category | No memory | Arachne | Gold |
|----------|----------:|--------:|-----:|
| 1 Multi-part | 0.007 | 0.089 | 0.417 |
| 2 Temporal | 0.002 | 0.111 | 0.159 |
| 3 Open | 0.035 | 0.041 | 0.060 |
| 4 Single-hop | 0.001 | **0.369** | **0.564** |
| 5 Adversarial | **1.000** | 0.980 | 0.960 |

### What the pattern says

**1. The floor is honest.**  
No-memory answers are essentially all `No information available.`, with perfect adversarial (cat 5) abstention. The speech centre is not quietly reconstructing the dialog from parameters under this prompt. That makes the Arachne lift attributable to **evidence**, not leakage.

**2. Memory helps most where top-k facts are enough.**  
The largest Arachne gain is single-hop (cat 4): nearly zero without evidence → ~0.37 with memory. That is the signature of “if the right turn is in the top five, the mouth can quote a short fact.”

**3. Gold still wins → retrieval is the primary bottleneck.**  
Same model, same prompt, better evidence → +0.13 overall F1. Combined with retrieval recall ~0.48, the story is consistent: **coverage and ranking of recallable records**, not a broken speech centre, explain most of the remaining gap to gold.

**4. Even gold is far from 1.0.**  
Perfect evidence does not yield perfect F1. Short-answer metrics are brittle on dates and multi-part strings; multi-hop and open categories stay hard when only a handful of snippets are shown and composition is discouraged. Part of the ceiling is **speech + metric**, not memory.

**5. Adversarial abstention softens slightly when evidence appears.**  
Cat 5 drops from 1.0 (no memory) to ~0.98 (Arachne) and ~0.96 (gold). With *some* text on the table, the model occasionally answers when it should refuse. Memory can increase false confidence. Worth monitoring; not the main result.

**6. Abstention rates track evidence quality.**  
No memory always abstains; Arachne abstains more than gold. Often the index did not surface enough usable material—or surfaced the wrong turns—so the model stays silent. That is a retrieval symptom as much as a personality trait.

---

## How to read this as a memory-system result

### Claims we *can* support

- Under a fixed speech policy, **Arachne’s sealed BM25 memory path is better than no memory** on LoCoMo10.  
- There is **clear headroom** to oracle evidence selection (and thus to better ranking, denser retrieval, higher *k*, or richer record schemas).  
- Failure mode is largely **recall@k / ranking / record shape**, not “the organism cannot speak.”  
- Restart and safety seals for the **offline public retrieval pipeline** hold in this registered configuration.

### Claims we *cannot* support from this alone

- Arachne beats arbitrary third-party RAG systems (we only compare empty vs Arachne vs gold).  
- Full multi-agent, tool-using, self-rewriting behavior is validated.  
- Dense embeddings would help (not tested; policy is BM25).  
- Full-dialog context (`model_only`) is better or worse (not run in this light pass).  
- Production hot-path latency of the Zig stack (we mostly measured provider RPM).

### Cross-run note

In this campaign, no-memory completed on one sealed run ID and Arachne/gold on another, with the **same model, protocol, and dataset**. That is acceptable for a research narrative; it is **not** a single four-lane evidence seal. A future pass can put all three light lanes on one run ID for a tighter packet.

---

## Pipeline diagram

```text
LoCoMo public dialog
        │
        ▼
 Arachne memory build (episodes / recallable records)
        │
        ▼
 BM25 ranked query ──► top-5 records ──► speech centre
        │                    │                  │
        ▼                    ▼                  ▼
 retrieval recall      arachne answer F1   short string
      ~0.48                 0.41           vs oracle
                                              │
                         gold evidence F1 ────┤ 0.54
                         no-memory F1 ────────┘ 0.23
```

---

## Why this kind of evaluation matters for Arachne

Arachne is not a chatbot product. It is an attempt to take long-horizon machine agency seriously—with memory, coordination, and governance as load-bearing structure rather than demos.

That only works if memory is **auditable**. ALME-2 forces:

- a **registered** retrieval policy and schemas;  
- **immutable** prepare seals and attempt journals;  
- **fail-closed** provider handling;  
- metrics that separate **retrieval** from **speech**.

The result is not a leaderboard trophy. It is a diagnostic:

> The mouth, given good evidence, can work.  
> The memory path already helps.  
> The distance to gold is where the next engineering hours go—ranking, coverage, record fidelity, and only then prompt or model changes.

---

## What we will do next

1. **Error slices** — gold correct & Arachne abstains (pure miss); both wrong (speech/metric); Arachne wrong & gold right (ranking/noise).  
2. **Sealed top-k variants** (10 / 20) — coverage vs noise.  
3. **Retrieval-only dashboards** (recall@k, MRR) without paying for speech.  
4. l_only` on a subset** — long-context baseline vs memory.  
5. **Single run ID** for all light lanes when we want one sealed research packet.

---

## Appendix: run configuration (this campaign)

| Item | Value |
|------|--------|
| Benchmark | LoCoMo10 (registered), 1,986 questions |
| Protocol | `arachne.locomo_system_eval.v2` |
| Retrieval policy | `arachne.memory_retrieval.bm25.v1`, top-k = 5 |
| Speech model | Grok 4.3 via xAI API |
| Decoding | temperature 0, max completion 128, thinking disabled in request |
| Light lanes scored | no_memory, arachne, gold_evidence |
| Metrics schema | `arachne.locomo_light_metrics.v1` |
| Status | Research `SCORED` metrics — **not** a four-lane `VALID` decision packet |

---

*Arachne is a research project on distributed, self-regulating machine intelligence. We publish measurements with their limits attached. If the question of machine selfhood is real, the evidence has to be real too.*
