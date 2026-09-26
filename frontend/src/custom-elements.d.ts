// Type declarations for Dialogflow custom elements
declare namespace React {
  namespace JSX {
    interface IntrinsicElements {
      "df-messenger": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        "project-id"?: string;
        "agent-id"?: string;
        "language-code"?: string;
        "max-query-length"?: string;
        "allow-feedback"?: string;
        "payload-text-visible"?: string;
      };
      "df-messenger-chat-bubble": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        "chat-title"?: string;
      };
    }
  }
}
