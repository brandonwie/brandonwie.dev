import { registerCommand } from "./index";
import type { OutputLine } from "../stores/terminal";

registerCommand("whoami", () => {
  const output: OutputLine[] = [
    { type: "text", content: "" },
    {
      type: "purple",
      content:
        "  ██████╗ ██████╗  █████╗ ███╗   ██╗██████╗  ██████╗ ███╗   ██╗",
    },
    {
      type: "purple",
      content:
        "  ██╔══██╗██╔══██╗██╔══██╗████╗  ██║██╔══██╗██╔═══██╗████╗  ██║",
    },
    {
      type: "purple",
      content:
        "  ██████╔╝██████╔╝███████║██╔██╗ ██║██║  ██║██║   ██║██╔██╗ ██║",
    },
    {
      type: "purple",
      content:
        "  ██╔══██╗██╔══██╗██╔══██║██║╚██╗██║██║  ██║██║   ██║██║╚██╗██║",
    },
    {
      type: "purple",
      content:
        "  ██████╔╝██║  ██║██║  ██║██║ ╚████║██████╔╝╚██████╔╝██║ ╚████║",
    },
    {
      type: "purple",
      content:
        "  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═════╝  ╚═════╝ ╚═╝  ╚═══╝",
    },
    { type: "text", content: "" },
    { type: "text", content: "  Brandon (Seokhyun) Wie | 위석현" },
    {
      type: "text",
      content: "  Product Engineer (Co-Lead Backend) @ Moba | Seoul",
    },
    { type: "text", content: "" },
    { type: "text", content: "  Film school grad turned backend engineer." },
    {
      type: "text",
      content: "  Self-taught since 2019, now building calendar sync",
    },
    {
      type: "text",
      content: "  infrastructure processing 6M+ events at scale.",
    },
    { type: "text", content: "  Bilingual in Korean and English." },
    { type: "text", content: "" },
    { type: "text", content: "  Currently:" },
    {
      type: "text",
      content: "    • Co-leading backend for Archi Calendar (Moba)",
    },
    {
      type: "text",
      content: "    • Building AI data pipelines with Airflow & AWS",
    },
    {
      type: "text",
      content: "    • Owning AWS/Terraform infrastructure & CI/CD",
    },
    {
      type: "text",
      content: "    • Preparing for Georgia Tech OMSCS (Spring 2027)",
    },
    { type: "text", content: "" },
    { type: "text", content: "  Tech Stack:" },
    { type: "text", content: "    Languages:  TypeScript, Python, Kotlin" },
    { type: "text", content: "    Backend:    NestJS, Spring Boot, TypeORM" },
    {
      type: "text",
      content: "    Infra:      AWS (ECS/RDS/S3), Terraform, GitHub Actions",
    },
    {
      type: "text",
      content: "    Data:       PostgreSQL, Redis, Airflow, Amplitude",
    },
    { type: "text", content: "" },
    { type: "text", content: "  Career Path:" },
    {
      type: "text",
      content: "    2019  Switched to software (AstroLabs, Dubai)",
    },
    { type: "text", content: "    2021  MODULABS — Frontend ($6M Series A)" },
    {
      type: "text",
      content: "    2023  Moviation — Frontend (Korea first UAM)",
    },
    {
      type: "text",
      content: "    2023  Playtag — Full-stack (Superman Award)",
    },
    {
      type: "text",
      content: "    2025  Moba — Lead Backend → Co-Lead Backend",
    },
    { type: "text", content: "" },
    { type: "text", content: "  Certifications:" },
    { type: "text", content: "    • AWS Certified Cloud Practitioner" },
    { type: "text", content: "    • Duke C Programming & Java OOP (Coursera)" },
    { type: "text", content: "    • Nand2Tetris I/II, Stanford ML (Coursera)" },
    { type: "text", content: "" },
    { type: "text", content: "  Type 'open <link>' to connect:" },
    {
      type: "link",
      content: "    github     → github.com/brandonwie",
      link: "https://github.com/brandonwie",
    },
    {
      type: "link",
      content: "    linkedin   → linkedin.com/in/brandonwie",
      link: "https://linkedin.com/in/brandonwie",
    },
    {
      type: "link",
      content: "    email      → brandon@brandonwie.dev",
      link: "mailto:brandon@brandonwie.dev",
    },
    {
      type: "link",
      content: "    portfolio  → crucio.brandonwie.dev",
      link: "https://crucio.brandonwie.dev",
    },
    { type: "text", content: "" },
  ];

  return { output };
});

// Alias: about
registerCommand("about", () => {
  const output: OutputLine[] = [
    { type: "text", content: "" },
    { type: "text", content: "  About Brandon (Seokhyun) Wie" },
    { type: "text", content: "  ──────────────────────────────" },
    { type: "text", content: "" },
    {
      type: "text",
      content: "  Backend engineer building production systems at scale.",
    },
    {
      type: "text",
      content: "  Switched from film (Hanyang Univ.) to software in 2019,",
    },
    {
      type: "text",
      content: "  grew through 4 companies from frontend to backend lead.",
    },
    { type: "text", content: "" },
    { type: "text", content: "  This blog is a collection of my learnings," },
    {
      type: "text",
      content: "  from calendar sync edge cases and infrastructure",
    },
    { type: "text", content: "  deep-dives to practical engineering guides." },
    { type: "text", content: "" },
    { type: "text", content: "  Run 'whoami' for full profile." },
    { type: "text", content: "" },
  ];

  return { output };
});
