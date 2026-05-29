// Admin Dashboard — globale "Bronnen" is verwijderd uit de navigatie: bronnen
// zijn voortaan alléén per klant toegankelijk (klantdetail → tab Bronnen).
// Deze route blijft bestaan als redirect zodat oude bookmarks/links niet 404'en.

import { redirect } from 'next/navigation';

export default function BronnenRedirect() {
  redirect('/admindashboard/klanten');
}
