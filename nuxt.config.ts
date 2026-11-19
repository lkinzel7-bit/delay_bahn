export default defineNuxtConfig({
  modules: ["@nuxtjs/supabase"],
  // Optional: disable automatic redirect to /login if you handle auth protection per page/route
  supabase: {
    redirect: false,
  },
  typescript: {
    tsConfig: {
      compilerOptions: {
        types: ["node"],
      },
      include: ["../tests/**/*"],
    },
  },
});
