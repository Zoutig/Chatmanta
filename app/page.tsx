import { redirect } from 'next/navigation';

/**
 * Root `/` is geen primary scherm meer — admin-tool zit nu op
 * `/admintool` en de centrale hub op `/home`. Oude bookmarks of
 * directe URL-hits worden zachtjes doorgestuurd naar de hub.
 */
export default function RootRedirect(): never {
  redirect('/home');
}
