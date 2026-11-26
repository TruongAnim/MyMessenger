import { HashRouter, Routes, Route } from 'react-router-dom'
import { DataSourceProvider, useDataSource } from './context/DataSourceContext'
import ZipPicker from './components/ZipPicker'
import HomePage from './pages/HomePage'
import ConversationDetail from './pages/ConversationDetail'
import ConversationChat from './pages/ConversationChat'
import MergePage from './pages/MergePage'

function Router() {
  const { status } = useDataSource()

  // Data lives only in memory, so a view that reads it has nothing to show
  // until a zip is open — including after a refresh on a deep link.
  const gated = element => (status === 'ready' ? element : <ZipPicker />)

  return (
    <HashRouter>
      <Routes>
        {/* Merging is what you do *before* opening a zip, so it stays ungated. */}
        <Route path="/merge" element={<MergePage />} />

        <Route path="/" element={gated(<HomePage />)} />
        <Route path="/conversation/:id" element={gated(<ConversationDetail />)} />
        <Route path="/conversation/:id/chat" element={gated(<ConversationChat />)} />
        <Route path="*" element={gated(<HomePage />)} />
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
