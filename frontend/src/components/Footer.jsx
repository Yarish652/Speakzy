import { Languages, GithubIcon } from "lucide-react";

// Slim global footer. Also carries the app-wide Tatoeba attribution
// (grammar-tutor sentences are CC-BY 2.0 FR - keep the credit).
const Footer = () => {
  return (
    <footer className="border-t border-base-200 bg-base-100">
      <div className="mx-auto flex max-w-8xl flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-2 text-sm text-base-content/60">
          <Languages className="size-4 text-primary" />
          <span className="font-medium text-base-content">Speakzy</span>
          <span className="hidden sm:inline">— learn languages with real people and AI</span>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs text-base-content/50">
          <a
            href="https://github.com/Yarish652/Speakzy"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 transition-colors duration-200 hover:text-base-content"
          >
            <GithubIcon className="size-3.5" />
            GitHub
          </a>
          <a href="https://tatoeba.org" target="_blank" rel="noreferrer" className="transition-colors duration-200 hover:text-base-content">
            Examples: Tatoeba (CC-BY)
          </a>
          <span>(c) {new Date().getFullYear()} Speakzy</span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
