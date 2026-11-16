import { useEffect, useState } from 'react'
import DashboardLayout from './layouts/DashboardLayout'
import OverviewDashboard from './pages/OverviewDashboard'
import VehicleManagement from './pages/VehicleManagement'
import ParkingSlotManagement from './pages/ParkingSlotManagement'
import OptimizationCenter from './pages/OptimizationCenter'
import AnalyticsReports from './pages/AnalyticsReports'
import SettingsPage from './pages/SettingsPage'
import { parkingApi } from './services/api'

export default function App() {
  const [activePage, setActivePage] = useState('overview')
  const [backendHealthy, setBackendHealthy] = useState(true)

  useEffect(() => {
    let mounted = true
    const checkHealth = async () => {
      try {
        await parkingApi.getHealth()
        if (mounted) setBackendHealthy(true)
      } catch {
        if (mounted) setBackendHealthy(false)
      }
    }
    checkHealth()
    const timer = setInterval(checkHealth, 30000)
    return () => {
      mounted = false
      clearInterval(timer)
    }
  }, [])

  const renderPage = () => {
    switch (activePage) {
      case 'overview':
        return <OverviewDashboard onNavigate={setActivePage} />
      case 'vehicles':
        return <VehicleManagement />
      case 'slots':
        return <ParkingSlotManagement />
      case 'optimization':
        return <OptimizationCenter />
      case 'analytics':
        return <AnalyticsReports />
      case 'settings':
        return <SettingsPage />
      default:
        return <OverviewDashboard onNavigate={setActivePage} />
    }
  }

  return (
    <DashboardLayout
      activePage={activePage}
      onNavigate={setActivePage}
      backendHealthy={backendHealthy}
    >
      {renderPage()}
    </DashboardLayout>
  )
}

