# Citation accuracy audit — October 6, 2026

The initial fixture report matched 65 of 76 citations exactly. Eleven spans differed
by one line, and the corpus tests allowed those differences as warnings. The five
affected original PDFs were downloaded through their Google Patents PDF links and
re-parsed using PDF.js 5.5.207 and the current position-map builder. Rendered PDF
pages and extracted gutter markers were used to check the revised boundaries.

Ten of the original discrepancies came from stale fixture line numbers. Their
golden citations were preserved. One original golden span was incorrect; fresh
parsing also exposed two other incorrect golden spans in a partially captured map.
Only these three expected citations changed:

| Case | Previous expected span | Verified span | Evidence |
|---|---|---|---|
| US4723129-claims | 34:24-26 | 34:25-27 | PDF page 30, printed column 34: “We claim” aligns with gutter line 25; the selected opening ends two lines later. |
| US5371234-claims | 5:20-23 | 5:24-27 | PDF page 5, printed column 5: the heading precedes the line marked 25; the selection ends on line 27. |
| US5371234-chemical-cross-col | 5:15-19 | 5:18-22 | PDF page 5, printed column 5: the closing paragraph begins three lines below the line marked 15 and ends two lines above the claims heading. |

The ten preserved golden spans are:

| Case | Verified span | PDF page |
|---|---|---|
| US6738932-spec-short | 1:37 | 6 |
| US6738932-spec-long | 1:33-37 | 6 |
| US6738932-cross-col | 1:67-2:1 | 6 |
| US5371234-spec-short | 1:7-9 | 3 |
| US7509250-spec-long | 1:63-67 | 15 |
| US7509250-cross-col | 1:63-2:2 | 15 |
| US6324676-spec-short | 1:36-43 | 11 |
| US6324676-spec-long | 1:58-65 | 11 |
| US6324676-claims | 8:36-45 | 14 |
| US6324676-cross-col | 1:66-2:2 | 11 |

## Parser findings

The sequential-column pass incorrectly used the ratio of left/right PDF text-item
counts to reject every page. OCR fragment counts can differ substantially between
columns even when both contain text. Rejecting column 3 then prevented every later
column from matching the strict sequence. Once the sequence starts, the builder now
uses matching printed headers without requiring a balanced OCR item count. It still
rejects unexpected forward/backward jumps, drawings, and correction certificates.

Header extraction also mistook a centered patent-number fragment (`129` in
US4723129) for a column header and missed OCR column numbers with a trailing period
(`4.` in US5371234). It now excludes centered fragments and accepts that punctuation.
The refreshed US4723129 map covers columns 1–36, and US5371234 covers columns 1–6.
All five affected fixture files were regenerated from the PDF bytes; the golden
file was not regenerated from algorithm output.

## Source identity

PDFs are retained in the ignored `tests/e2e/.pdf-cache/` directory. These SHA-256
hashes identify the original inputs independently of the fixtures:

| Patent source | PDF SHA-256 |
|---|---|
| [US6738932](https://patents.google.com/patent/US6738932) | `6633df9d7910129a5104524feb858cad72ef9fd2e704e43c4796bf591219e4be` |
| [US4723129](https://patents.google.com/patent/US4723129) | `7abb26968360fc8ab3aa380fd671ef84f0f10fcf96826e19b0240701bbd8fc0a` |
| [US5371234](https://patents.google.com/patent/US5371234) | `7b224776bc44f8c7f358958dcea39692741f1448d2ed995ba5506a12937c1233` |
| [US7509250](https://patents.google.com/patent/US7509250) | `1aa4a08cedcf1af361eb50f837167dcc5322d788f7e8323218247b40a79685b6` |
| [US6324676](https://patents.google.com/patent/US6324676) | `6ab96a8fbd630396bf88812ae1b4882406f6a8a9e5b8a99cd512035462baf38c` |

## Enforcement

The corpus assertions now require exact spans, including one-line boundary
differences. Per-category accuracy reports count only exact results as correct.
The refreshed corpus matches 76/76 golden citations exactly. This is agreement
with this bounded corpus, not a claim of universal patent citation accuracy.
