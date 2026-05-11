'use client';

/**
 * Aurora-achtergrond voor de chat-kolom (Manta-stijl).
 * Drie radial-gradient blobs met heel zachte teal-tint die langzaam over
 * elkaar drijven. Pure CSS animatie, geen JS-loop = geen perf-impact.
 */
export function MantaAurora() {
  return (
    <div className="manta-aurora" aria-hidden="true">
      <div className="manta-aurora-blob manta-aurora-blob-1" />
      <div className="manta-aurora-blob manta-aurora-blob-2" />
      <div className="manta-aurora-blob manta-aurora-blob-3" />
    </div>
  );
}
