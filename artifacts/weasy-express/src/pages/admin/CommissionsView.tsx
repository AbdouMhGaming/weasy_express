import { useTranslation } from "react-i18next";

export default function CommissionsView() {
  const { t } = useTranslation();
  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("admin.commissions.title")}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{t("admin.commissions.subtitle")}</p>
      </div>
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-700 mb-2">{t("admin.commissions.comingSoon")}</h2>
        <p className="text-gray-400 text-sm max-w-sm">{t("admin.commissions.comingSoonDesc")}</p>
      </div>
    </div>
  );
}
