import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";

const components = {
  h1: (props) => <h1 className="text-lg font-bold text-gray-900 mt-4 mb-2 first:mt-0" {...props} />,
  h2: (props) => <h2 className="text-base font-bold text-gray-900 mt-4 mb-2 first:mt-0" {...props} />,
  h3: (props) => <h3 className="text-sm font-semibold text-gray-900 mt-3 mb-1.5 first:mt-0" {...props} />,
  p: (props) => <p className="text-sm text-gray-700 leading-relaxed mb-3 last:mb-0" {...props} />,
  ul: (props) => <ul className="list-disc list-inside text-sm text-gray-700 space-y-1 mb-3" {...props} />,
  ol: (props) => <ol className="list-decimal list-inside text-sm text-gray-700 space-y-1 mb-3" {...props} />,
  li: (props) => <li className="text-sm" {...props} />,
  strong: (props) => <strong className="font-semibold text-gray-900" {...props} />,
  a: (props) => <a className="text-primary hover:underline" target="_blank" rel="noreferrer" {...props} />,
  blockquote: (props) => (
    <blockquote className="border-l-2 border-primary/30 pl-3 italic text-gray-500 mb-3" {...props} />
  ),
  code(props) {
    const { children, className, node, ...rest } = props;
    const match = /language-(\w+)/.exec(className || "");
    return match ? (
      <SyntaxHighlighter
        {...rest}
        PreTag="div"
        language={match[1]}
        style={oneLight}
        className="!mb-3 !text-xs !rounded-lg"
      >
        {String(children).replace(/\n$/, "")}
      </SyntaxHighlighter>
    ) : (
      <code {...rest} className="px-1 py-0.5 rounded bg-gray-100 text-xs font-mono text-gray-700">
        {children}
      </code>
    );
  },
};

const MarkdownRenderer = ({ content }) => (
  <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
    {content}
  </ReactMarkdown>
);

export default MarkdownRenderer;
