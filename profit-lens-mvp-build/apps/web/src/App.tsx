import { AppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { SWRConfig } from "swr";
import { swrFetcher } from "./lib/api";
import DashboardPage from "./pages/DashboardPage";

export default function App() {
  return (
    <AppProvider i18n={enTranslations}>
      <SWRConfig value={{ fetcher: swrFetcher, revalidateOnFocus: false }}>
        <DashboardPage />
      </SWRConfig>
    </AppProvider>
  );
}
