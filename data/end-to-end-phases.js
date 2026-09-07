window.TRACECLAW_END_TO_END_PHASES = {
  gateway: [
    {
      id: "GW1",
      number: 1,
      title: "Ingress & Validation",
      subtitle: "Authenticate the connection, authorize chat.send, validate the RPC request, and normalize the message.",
      stages: ["G0","G1","G2","G3","G4","G5"],
      source: [
        "src/gateway/server/ws-connection/auth-context.ts · resolveConnectAuthState",
        "src/gateway/server/ws-connection/message-handler.ts · connect handshake",
        "src/gateway/server-methods.ts · authorizeGatewayMethod",
        "src/gateway/server-methods/chat.ts · chat.send validation / sanitization"
      ]
    },
    {
      id: "GW2",
      number: 2,
      title: "Routing & Admission",
      subtitle: "Resolve the requested Agent and Session, enforce routing/policy, reject duplicates, and admit the work.",
      stages: ["G6","G7","G8","G9","G10","G11","G12"],
      source: [
        "src/gateway/server-methods/chat.ts · resolveRequestedChatAgentId",
        "src/gateway/server-methods/chat.ts · Session load / validation",
        "src/gateway/server-methods/chat.ts · resolveSessionAgentId",
        "src/gateway/server-methods/chat.ts · send policy / dedupe / admission"
      ]
    },
    {
      id: "GW3",
      number: 3,
      title: "Context & Dispatch",
      subtitle: "Construct and finalize runtime context, enter auto-reply, re-check the downstream Agent, and select the reply resolver.",
      stages: ["G13","G14","G15","G16","G17","G18"],
      source: [
        "src/gateway/server-methods/chat.ts · MsgContext construction",
        "src/auto-reply/dispatch.ts · dispatchInboundMessage",
        "src/auto-reply/reply/inbound-context.ts · finalizeInboundContext",
        "src/auto-reply/reply/dispatch-from-config.ts · dispatchFromConfig / replyResolver"
      ]
    }
  ],
  agent: [
    {
      id: "AR1",
      number: 4,
      title: "Runtime Setup",
      subtitle: "Enter the selected reply path, prepare the Agent turn, choose the runtime attempt, and start the Agent lifecycle.",
      runtimeEvents: ["agent_runtime_selected","agent_run_started"],
      sourceSteps: [
        {
          title: "Enter the selected reply resolver",
          detail: "G18 selects the custom resolver or the default getReplyFromConfig path.",
          source: "src/auto-reply/reply/dispatch-from-config.ts · replyResolver(...)"
        },
        {
          title: "Prepare the reply turn",
          detail: "getReplyFromConfig continues into runPreparedReply after Session, prompt, policy, and model state are resolved.",
          source: "src/auto-reply/reply/get-reply.ts → src/auto-reply/reply/get-reply-run.ts · runPreparedReply"
        },
        {
          title: "Enter Agent runner / fallback control",
          detail: "runPreparedReply calls runReplyAgent, which enters runAgentTurnWithFallback.",
          source: "src/auto-reply/reply/get-reply-run.ts → src/auto-reply/reply/agent-runner.ts"
        },
        {
          title: "Select the concrete runtime attempt",
          detail: "The current attempt chooses CLI or embedded execution together with provider/model.",
          source: "src/auto-reply/reply/agent-runner-execution.ts · CLI / runEmbeddedAgent branch",
          runtimeEvent: "agent_runtime_selected"
        },
        {
          title: "Prepare embedded execution",
          detail: "On the embedded path OpenClaw constructs runtime tools, creates the Agent session, subscribes lifecycle/tool/message handlers, and submits the prompt. These internals remain SOURCE-MAPPED unless separately instrumented.",
          source: "src/agents/embedded-agent-runner/run/attempt.ts · createOpenClawCodingTools / createAgentSession / subscribeEmbeddedAgentSession / activeSession.prompt"
        },
        {
          title: "Agent lifecycle starts",
          detail: "The existing Agent event bus emits lifecycle phase=start for this run.",
          source: "src/agents/embedded-agent-subscribe.handlers.lifecycle.ts · handleAgentStart",
          runtimeEvent: "agent_run_started"
        }
      ]
    },
    {
      id: "AR2",
      number: 5,
      title: "Agent Execution",
      subtitle: "Run the active Agent turn, observe tool activity when it actually occurs, and finalize the assistant reply boundary.",
      runtimeEvents: ["agent_run_started","tool_started","tool_result","agent_reply_finalized"],
      sourceSteps: [
        {
          title: "Execute the active Agent prompt",
          detail: "The embedded runner calls activeSession.prompt(...) and subscribes to the resulting Agent event stream.",
          source: "src/agents/embedded-agent-runner/run/attempt.ts · promptActiveSession / activeSession.prompt"
        },
        {
          title: "Observe tool start events when present",
          detail: "A real tool_execution_start produces the Agent bus tool phase=start event. No tool node is invented when the current run has none.",
          source: "src/agents/embedded-agent-subscribe.handlers.tools.ts · handleToolExecutionStart",
          runtimeEvent: "tool_started"
        },
        {
          title: "Observe tool results when present",
          detail: "Tool completion is sanitized and emitted as a tool result event for the same toolCallId.",
          source: "src/agents/embedded-agent-subscribe.handlers.tools.ts · handleToolExecutionEnd",
          runtimeEvent: "tool_result"
        },
        {
          title: "Finalize the assistant message",
          detail: "Assistant message-end processing resolves the visible final text and provider/model metadata.",
          source: "src/agents/embedded-agent-subscribe.handlers.messages.ts · handleMessageEnd",
          runtimeEvent: "agent_reply_finalized"
        }
      ]
    },
    {
      id: "AR3",
      number: 6,
      title: "Completion & Return",
      subtitle: "Close the Agent lifecycle, return the resolver result across the G18 boundary, and resume G16 post-processing.",
      runtimeEvents: ["agent_reply_finalized","agent_run_ended","reply_resolver_returned"],
      sourceSteps: [
        {
          title: "Finalize the Agent reply boundary",
          detail: "When directly captured, agent_reply_finalized is the internal final assistant boundary. A chat.history answer is shown only as downstream RESPONSE evidence, never relabeled as this event.",
          source: "src/agents/embedded-agent-subscribe.handlers.messages.ts · handleMessageEnd",
          runtimeEvent: "agent_reply_finalized"
        },
        {
          title: "Emit terminal Agent lifecycle",
          detail: "The Agent event bus emits lifecycle phase=end or phase=error with terminal metadata.",
          source: "src/agents/embedded-agent-subscribe.handlers.lifecycle.ts · handleAgentEnd",
          runtimeEvent: "agent_run_ended"
        },
        {
          title: "Return from the reply resolver",
          detail: "replyResult returns from the selected resolver to dispatchFromConfig; TraceClaw records its kind/count at this boundary.",
          source: "src/auto-reply/reply/dispatch-from-config.ts · replyResult / reply_resolver_returned",
          runtimeEvent: "reply_resolver_returned"
        },
        {
          title: "Resume G16 delivery / completion",
          detail: "After the resolver returns, dispatchFromConfig continues post-processing, filtering/delivery, and completion. This continuation is source control flow unless another direct event is captured.",
          source: "src/auto-reply/reply/dispatch-from-config.ts · post-replyResult processing"
        }
      ]
    }
  ]
};
