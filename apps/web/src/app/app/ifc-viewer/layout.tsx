// Layout isolado para o visualizador IFC — sem sidebar/header.
// O parent layout (app/layout.tsx) trata /app/ifc-viewer como STATUS_PAGE
// e não renderiza sidebar nem header.
export default function IfcViewerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
