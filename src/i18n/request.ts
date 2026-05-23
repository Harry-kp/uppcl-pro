import { getRequestConfig } from "next-intl/server";

export default getRequestConfig(async () => {
  const locale = "en"; // default, client switches dynamically
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
