import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";

// Split into its own module so the syntax highlighter (the single heaviest
// dependency in the app) is only downloaded when an answer actually contains a
// fenced code block — see MarkdownRenderer's lazy import.
const CodeBlock = ({ language, children, ...rest }) => (
  <SyntaxHighlighter {...rest} PreTag="div" language={language} style={oneLight} className="!mb-3 !text-xs !rounded-lg">
    {children}
  </SyntaxHighlighter>
);

export default CodeBlock;
