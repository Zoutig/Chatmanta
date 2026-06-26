// Re-export shim — extractDocText is verplaatst naar het neutrale lib/rag/doc-parse.ts
// (zodat de V1-ingest 'm mag importeren onder de grep-gate). V0-callers
// (adminUploadDocAction, ingestAction etc.) blijven via dit pad byte-identiek werken.
export * from '@/lib/rag/doc-parse';
