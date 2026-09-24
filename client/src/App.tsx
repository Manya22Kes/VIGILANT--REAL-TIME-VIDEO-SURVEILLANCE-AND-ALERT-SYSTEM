import { BrowserRouter, Routes, Route } from "react-router-dom";
import StatusBar from "./components/StatusBar";
import TabNav from "./components/TabNav";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import LiveFeed from "./tabs/LiveFeed";
import AlertsHistory from "./tabs/AlertsHistory";
import ModelStats from "./tabs/ModelStats";
import { CameraStatusProvider } from "./lib/cameraStatus";
import { AuthProvider, useAuth } from "./lib/authContext";
import { SoundStatusProvider } from "./lib/soundStatus";

function AppShell() {
  const { token } = useAuth();
  if (!token) return <Login />;

  return (
    <CameraStatusProvider>
      <SoundStatusProvider>
        <BrowserRouter>
          <div className="flex flex-col h-full">
            <StatusBar />
            <TabNav />
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/live" element={<LiveFeed />} />
              <Route path="/alerts" element={<AlertsHistory />} />
              <Route path="/stats" element={<ModelStats />} />
            </Routes>
          </div>
        </BrowserRouter>
      </SoundStatusProvider>
    </CameraStatusProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
