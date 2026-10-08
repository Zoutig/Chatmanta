// Templates remounten bij elke navigatie (layouts niet): zo krijgt elke nieuwe
// pagina een korte fade + 6px-omhoog-inkomst (spec §5).
export default function V1AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="v1-page-enter">{children}</div>;
}
