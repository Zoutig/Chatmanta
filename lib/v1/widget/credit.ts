// De credit-link onder de V1-widget ("Mogelijk gemaakt door ChatManta").
//
// Bewust een ABSOLUTE URL: in de iframe (/embed-v1/[slug]) wijst een relatief '/'
// naar de embed-origin, en lokaal of op een preview-deploy naar localhost of de
// preview-URL. Bewust GEEN klant-slug of org-info in de URL: de bezoeker hoeft niet
// te zien bij welke klant hij vandaan komt, en rel="noreferrer" stuurt de embed-URL
// ook niet als Referer mee. De vaste utm-parameters zijn de enige manier om
// widget-verkeer later op de marketingsite te herkennen (noreferrer wist de herkomst).
import { SITE_URL } from '@/lib/site/navigation';

export const WIDGET_CREDIT_URL = `${SITE_URL}/?utm_source=widget&utm_medium=credit`;
