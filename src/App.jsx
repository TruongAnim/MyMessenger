import { HashRouter, Routes, Route } from 'react-router-dom'
import { DataSourceProvider, useDataSource } from './context/DataSourceContext'
import ZipPicker from './components/ZipPicker'
import HomePage from './pages/HomePage'
import ConversationDetail from './pages/ConversationDetail'
import ConversationChat from './pages/ConversationChat'
import MergePage from './pages/MergePage'

function Router() {
  const { status } = useDataSource()

  // Until a zip is loaded there is nothing to route to — including after a
  // refresh on a deep link, since data lives only in memory.
  if (status !== 'ready') return <ZipPicker />

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/conversation/:id" element={<ConversationDetail />} />
        <Route path="/conversation/:id/chat" element={<ConversationChat />} />
        <Route path="/merge" element={<MergePage />} />
      </Routes>
    </HashRouter>
  )
}

export default function App() {
  return (
    <DataSourceProvider>
      <Router />
    </DataSourceProvider>
  )
}
