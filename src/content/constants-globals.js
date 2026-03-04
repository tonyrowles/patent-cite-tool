// Classic script wrapper — defines MSG/STATUS/PATENT_TYPE as globals for content scripts.
// Source of truth: src/shared/constants.js — keep in sync until Phase 15 esbuild replaces this file.

const MSG = {
  PATENT_PAGE_DETECTED: 'patent-page-detected',
  PDF_LINK_FOUND: 'pdf-link-found',
  PDF_LINK_NOT_FOUND: 'pdf-link-not-found',
  FETCH_PDF: 'fetch-pdf',
  PDF_FETCH_RESULT: 'pdf-fetch-result',
  PARSE_PDF: 'parse-pdf',
  PARSE_RESULT: 'parse-result',
  GET_STATUS: 'get-status',
  LOOKUP_POSITION: 'lookup-position',
  CITATION_RESULT: 'citation-result',
  GENERATE_CITATION: 'generate-citation',
  FETCH_USPTO_PDF: 'fetch-uspto-pdf',
  USPTO_FETCH_RESULT: 'uspto-fetch-result',
  CHECK_CACHE: 'check-cache',
  CACHE_HIT_RESULT: 'cache-hit-result',
  CACHE_MISS: 'cache-miss',
  UPLOAD_TO_CACHE: 'upload-to-cache',
};

const STATUS = {
  IDLE: 'idle',
  FETCHING: 'fetching',
  READY: 'ready',
  PARSING: 'parsing',
  PARSED: 'parsed',
  NO_TEXT_LAYER: 'no-text-layer',
  ERROR: 'error',
  UNAVAILABLE: 'unavailable',
};

const PATENT_TYPE = {
  GRANT: 'grant',
  APPLICATION: 'application',
};
