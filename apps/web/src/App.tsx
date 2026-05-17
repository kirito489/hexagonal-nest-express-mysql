import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

import { Tooltip as TooltipPrimitive } from 'radix-ui'

import { ErrorBoundary } from '@/components/ErrorBoundary'
import { RequireAuth } from '@/components/RequireAuth'
import { Layout } from '@/routes/_layout'
import { LoginPage } from '@/routes/login/page'
import { HomePage } from '@/routes/home/page'
import { MembersPage } from '@/routes/members/page'
import { RolesPage } from '@/routes/roles/page'
import { queryClient } from '@/api/query-client'
import { Toaster } from '@/components/ui/sonner'

const TooltipProvider = TooltipPrimitive.Provider

export const App = () => {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                element={
                  <RequireAuth>
                    <Layout />
                  </RequireAuth>
                }
              >
                <Route path="/" element={<HomePage />} />
                <Route path="/members" element={<MembersPage />} />
                <Route path="/roles" element={<RolesPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
        <Toaster richColors closeButton />
        {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
