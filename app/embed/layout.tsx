// Root layout van deze sectie (de app heeft meerdere roots, zie app/_shell/app-root.tsx).
import { AppRoot, appMetadata, appViewport } from '../_shell/app-root';

export const metadata = appMetadata;
export const viewport = appViewport;

export default function SectionRootLayout({ children }: { children: React.ReactNode }) {
  return <AppRoot>{children}</AppRoot>;
}
