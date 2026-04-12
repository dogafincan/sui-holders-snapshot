import type { ReactNode } from "react"
import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router"
// import { TanStackDevtools } from "@tanstack/react-devtools"
// import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"

import { Toaster } from "@/components/ui/sonner"

import appCss from "../styles.css?url"

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Sui Holders Snapshot",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="bg-background">
        {children}
        <Toaster position="top-right" richColors closeButton />
        {/*
        <TanStackDevtools
          config={{
            position: "bottom-right",
          }}
          plugins={[
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        */}
        <Scripts />
      </body>
    </html>
  )
}
