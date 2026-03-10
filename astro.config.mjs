// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// https://astro.build/config
export default defineConfig({
  site: "https://yaptide.github.io",
  base: "/for_developers",
  integrations: [
    starlight({
      title: "YAPTIDE Developers",
      tagline: "A web-based IDE for Monte Carlo particle transport simulations",
      logo: {
        light: "./src/assets/yaptide-logo.svg",
        dark: "./src/assets/yaptide-logo.svg",
        replacesTitle: false,
      },
      favicon: "/src/assets/yaptide-logo.svg",
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/yaptide" },
      ],
      // Temporarily disable Starlight's injected 404 route to avoid a zod parse
      // error during static route generation in CI. This is a short-term
      // workaround while we investigate the root cause.
      disable404Route: true,
      customCss: ["./src/styles/custom.css"],
      editLink: {
        baseUrl: "https://github.com/yaptide/yaptide-docs/edit/main/",
      },
      sidebar: [
        {
          label: "Home",
          slug: "",
        },
        {
          label: "Local Setup",
          items: [
            {
              label: "Frontend Demo",
              slug: "local-setup/local-frontend-demo",
            },
            {
              label: "Full Stack - Celery Workers",
              slug: "local-setup/local-celery",
            },
            {
              label: "Full Stack - SLURM",
              slug: "local-setup/local-slurm",
            }
          ],
        },
        {
          label: "Docker Setup",
          items: [
            {
              label: "Frontend Demo",
              slug: "docker-setup/docker-frontend-demo",
            },
            {
              label: "Full Stack - Celery Workers",
              slug: "docker-setup/docker-celery",
            },
            {
              label: "Full Stack - SLURM",
              slug: "docker-setup/docker-slurm",
            },
          ],
        },
        {
          label: "Architecture",
          items: [
            { label: "System Overview", slug: "architecture/overview" },
            { label: "Data Flow", slug: "architecture/data-flow" },
            {
              label: "Project JSON Schema",
              slug: "architecture/project-json-schema",
            },
            { label: "Authentication Model", slug: "architecture/auth-model" },
          ],
        },
        {
          label: "Contributing",
          collapsed: false,
          items: [
            { label: "Contribution Guide", slug: "contributing/guide" },
            { label: "Code Style", slug: "contributing/code-style" },
            { label: "Glossary", slug: "contributing/glossary" },
          ],
        },
        {
          label: "Backend",
          collapsed: true,
          items: [
            { label: "Overview", slug: "backend/overview" },
            { label: "API Endpoints", slug: "backend/api-endpoints" },
            { label: "Database", slug: "backend/database" },
            {
              label: "Simulation Lifecycle",
              slug: "backend/simulation-lifecycle",
            },
            {
              label: "Simulator Management",
              slug: "backend/simulator-management",
            },
            {
              label: "Docker Deployment",
              slug: "backend/docker-deployment",
            },
            { label: "Testing", slug: "backend/testing" },
          ],
        },
        {
          label: "Frontend",
          collapsed: true,
          items: [
            { label: "Overview", slug: "frontend/overview" },
            { label: "3D Editor", slug: "frontend/3d-editor" },
            {
              label: "Simulation Services",
              slug: "frontend/simulation-services",
            },
            {
              label: "Pyodide Converter",
              slug: "frontend/pyodide-converter",
            },
            { label: "Geant4 WebAssembly", slug: "frontend/geant4-wasm" },
            { label: "Auth Flows", slug: "frontend/auth-flows" },
            { label: "Adding Commands", slug: "frontend/adding-commands" },
            { label: "Testing", slug: "frontend/testing" },
          ],
        },
        {
          label: "Converter",
          collapsed: true,
          items: [
            { label: "Overview", slug: "converter/overview" },
            { label: "Conversion Flow", slug: "converter/conversion-flow" },
            {
              label: "Adding a Simulator",
              slug: "converter/adding-a-simulator",
            },
            { label: "SHIELD-HIT12A", slug: "converter/shieldhit" },
            { label: "FLUKA", slug: "converter/fluka" },
            { label: "Geant4", slug: "converter/geant4" },
            { label: "Testing", slug: "converter/testing" },
          ],
        },
        {
          label: "API Reference",
          collapsed: true,
          items: [
            { label: "Overview", slug: "api-reference/overview" },
            { label: "Authentication", slug: "api-reference/auth" },
            { label: "Jobs", slug: "api-reference/jobs" },
            { label: "Results", slug: "api-reference/results" },
            { label: "User", slug: "api-reference/user" },
          ],
        },
      ],
    }),
  ],
});
