import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import c from "react-syntax-highlighter/dist/esm/languages/prism/c";
import cpp from "react-syntax-highlighter/dist/esm/languages/prism/cpp";
import csharp from "react-syntax-highlighter/dist/esm/languages/prism/csharp";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import diff from "react-syntax-highlighter/dist/esm/languages/prism/diff";
import go from "react-syntax-highlighter/dist/esm/languages/prism/go";
import java from "react-syntax-highlighter/dist/esm/languages/prism/java";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import markup from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import php from "react-syntax-highlighter/dist/esm/languages/prism/php";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import ruby from "react-syntax-highlighter/dist/esm/languages/prism/ruby";
import rust from "react-syntax-highlighter/dist/esm/languages/prism/rust";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";

// PrismLight ships no grammars of its own, so only the languages registered here are
// bundled (the full Prism build was ~600 kB). An unregistered language still renders,
// just without colours.
["bash", "sh", "shell"].forEach((name) => SyntaxHighlighter.registerLanguage(name, bash));
["c"].forEach((name) => SyntaxHighlighter.registerLanguage(name, c));
["cpp"].forEach((name) => SyntaxHighlighter.registerLanguage(name, cpp));
["csharp"].forEach((name) => SyntaxHighlighter.registerLanguage(name, csharp));
["css"].forEach((name) => SyntaxHighlighter.registerLanguage(name, css));
["diff"].forEach((name) => SyntaxHighlighter.registerLanguage(name, diff));
["go"].forEach((name) => SyntaxHighlighter.registerLanguage(name, go));
["java"].forEach((name) => SyntaxHighlighter.registerLanguage(name, java));
["javascript", "js"].forEach((name) => SyntaxHighlighter.registerLanguage(name, javascript));
["json"].forEach((name) => SyntaxHighlighter.registerLanguage(name, json));
["jsx"].forEach((name) => SyntaxHighlighter.registerLanguage(name, jsx));
["markdown", "md"].forEach((name) => SyntaxHighlighter.registerLanguage(name, markdown));
["markup", "html", "xml"].forEach((name) => SyntaxHighlighter.registerLanguage(name, markup));
["php"].forEach((name) => SyntaxHighlighter.registerLanguage(name, php));
["python", "py"].forEach((name) => SyntaxHighlighter.registerLanguage(name, python));
["ruby"].forEach((name) => SyntaxHighlighter.registerLanguage(name, ruby));
["rust"].forEach((name) => SyntaxHighlighter.registerLanguage(name, rust));
["sql"].forEach((name) => SyntaxHighlighter.registerLanguage(name, sql));
["tsx"].forEach((name) => SyntaxHighlighter.registerLanguage(name, tsx));
["typescript", "ts"].forEach((name) => SyntaxHighlighter.registerLanguage(name, typescript));
["yaml", "yml"].forEach((name) => SyntaxHighlighter.registerLanguage(name, yaml));

// Split into its own module so the highlighter is only downloaded when an answer
// actually contains a fenced code block — see MarkdownRenderer's lazy import.
const CodeBlock = ({ language, children, ...rest }) => (
  <SyntaxHighlighter {...rest} PreTag="div" language={language} style={oneLight} className="!mb-3 !text-xs !rounded-lg">
    {children}
  </SyntaxHighlighter>
);

export default CodeBlock;
