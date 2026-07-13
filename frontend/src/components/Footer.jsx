import { Languages, GithubIcon } from "lucide-react";

// Slim global footer. Also carries the app-wide Tatoeba attribution
// (grammar-tutor sentences are CC-BY 2.0 FR - keep the credit).
const Footer = () => {
  return (
    <footer className="border-t border-base-300 bg-base-200">
      <div className="px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Languages className="size-4 text-primary" />
          <span className="text-sm font-semibold">Speakzy</span>
          <span className="text-xs text-base-content/50 hidden sm:inline">
            - learn languages with real people and AI
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs text-base-content/50">
          <a
            href="https://github.com/Yarish652/Speakzy"
            target="_blank"
            rel="noreferrer"
            className="link link-hover inline-flex items-center gap-1"
          >
            <GithubIcon className="size-3.5" />
            GitHub
          </a>
          <a href="https://tatoeba.org" target="_blank" rel="noreferrer" className="link link-hover">
            Examples: Tatoeba (CC-BY)
          </a>
          <span>(c) {new Date().getFullYear()} Speakzy</span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
