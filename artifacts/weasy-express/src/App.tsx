import { useLayoutEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/Layout";

import HomePage from "@/pages/home";
import TrackingPage from "@/pages/tracking";
import LocationsPage from "@/pages/locations";
import ContactPage from "@/pages/contact";
import PartnerPage from "@/pages/partner";
import AgentPage from "@/pages/agent";
import PrivacyPage from "@/pages/privacy";
import TermsPage from "@/pages/terms";
import NotFound from "@/pages/not-found";
import AdminLogin from "@/pages/admin/login";
import AdminDashboard from "@/pages/admin/dashboard";
import ExpediteurLogin from "@/pages/expediteur/login";
import SuiviLogin from "@/pages/suivi/login";
import { applyStoredTheme, THEME_STORAGE_KEY } from "@/lib/theme";

const queryClient = new QueryClient();

function Router() {
  const [location] = useLocation();

  useLayoutEffect(() => {
    applyStoredTheme();
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) applyStoredTheme();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [location]);

  return (
    <Switch>
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/expediteurs/login" component={ExpediteurLogin} />
      <Route path="/expediteurs/payout-confirm/:id" component={AdminDashboard} />
      <Route path="/expediteurs" component={AdminDashboard} />
      <Route path="/suivi/login" component={SuiviLogin} />
      <Route path="/suivi" component={AdminDashboard} />
      <Route>
        <Layout>
          <Switch>
            <Route path="/" component={HomePage} />
            <Route path="/tracking" component={TrackingPage} />
            <Route path="/locations" component={LocationsPage} />
            <Route path="/contact" component={ContactPage} />
            <Route path="/partner" component={PartnerPage} />
            <Route path="/agent" component={AgentPage} />
            <Route path="/privacy" component={PrivacyPage} />
            <Route path="/terms" component={TermsPage} />
            <Route component={NotFound} />
          </Switch>
        </Layout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
