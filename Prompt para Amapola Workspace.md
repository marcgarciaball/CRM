# Amapola Workspace build prompt

## Recommended approach

Build a private workspace for five people, rather than a general-purpose project management platform. Every campaign, publication and task should provide direct access to its documents, designs and other links. Use monthly views to plan the work, and campaigns to keep related work together across months.

Amapola's public website sells photo prints on fabric, framed prints and personalized products for weddings and events. Use that business context to tailor examples and terminology. Source: [Amapola Lab website](https://byamapolalab.com/).

The visual direction below is a design proposal, not a verified reproduction of the brand's current colors or typography.

## Prompt to paste into Claude Code

```text
Build Amapola Workspace, a private internal web application for the team managing https://byamapolalab.com/.

Deliver a working, persistent application for five people, not just a visual prototype. Keep everyday actions simple. Do not build a Notion clone or an oversized enterprise project management system.

The most important requirement: when someone opens a campaign, publication or task, they must immediately find the links to all relevant materials. Monthly planning and clear ownership should make that work easy to coordinate.

These development instructions are in English. The application's user-facing interface must be in Spanish as used in Spain.

1. Business context and team

We currently use an Excel spreadsheet to plan publications, Google Drive documents for copy, and Figma for designs. Materials are scattered. It is difficult to find the right file, understand who needs to do what, and track each publication's status.

Team:
- Maite, business owner: full visibility, administration, editing, content creation and final approval.
- Ainhoa: creative assets for Meta and Google advertising, plus newsletter design.
- Sara: copy for newsletters and social media posts.
- Elisa: preparation and launch of Meta, Google and email campaigns.
- Ecommerce lead, me: administration, development, new pages, store improvements and opportunities. Use the Spanish display name "Responsable ecommerce" until I configure my name.

Everyone must be able to view shared work, create tasks, comment and add links. Treat these specialties as responsibilities, not unnecessary access restrictions.

2. Execution rules and token efficiency

First inspect the repository, its instructions and dependencies. Reuse a suitable existing foundation. Do not replace the stack unnecessarily.

If starting from scratch, use Next.js with App Router, TypeScript, Tailwind, shadcn/ui components, and Supabase for PostgreSQL and authentication. Choose compatible stable versions and use one package manager.

Before implementation, provide a plan of no more than 12 lines. Then proceed without asking for approval on reversible implementation decisions. Ask only when missing information affects security, costs or an essential external service.

Work in verifiable stages:
A. Data model, authentication, authorization and visual foundation.
B. Campaigns, deliverables, tasks and contextual links, with a complete persistent workflow.
C. Monthly planning, calendar, resource library and home overview.
D. Tests, fixes and minimal documentation.

Complete these stages in order. Do not stop after the plan or after building a mockup.

Keep context and output concise:
- Search and read only relevant files. Do not dump the entire repository into context.
- Make targeted changes and reuse existing components.
- Avoid redundant subagents, speculative architecture alternatives and duplicate documentation.
- Do not paste complete source files into chat.
- At the end of each stage, summarize what was implemented, verified and left pending in no more than 5 lines.
- Maintain one short handoff file, PROJECT_STATUS.md, covering decisions, current status, blockers and the next step. Never include secrets.
- Run targeted checks during development and a full validation pass at the end.
- Do not sacrifice security, persistence or testing to save tokens.

Do not purchase services, deploy the application or activate integrations without authorization. If credentials are missing, provide migrations, configuration and exact setup steps. A separate demo with fictional data is acceptable, but never describe it as a connected multiuser application.

3. Data model and organizing principles

Use these entities. Different screens must display the same underlying records, not maintain their own copies.

Campaign:
Name, objective, description, start and end dates, owner, status and archive metadata. Groups deliverables, tasks and resources. Also supports ecommerce initiatives, such as improving a product page.

Deliverable:
A piece intended for publication or launch, such as a newsletter, Meta ad, Google ad, Instagram post or landing page.
Fields: title, optional campaign, channel, owner, copy/brief, planned publication date, actual publication date and status.
Statuses: idea, in preparation, in review, changes requested, approved, scheduled and published. Display these labels in Spanish.

Task:
A specific action assigned to a person. Fields: title, description, assignee, creator, optional due date, priority, status, and optional campaign or deliverable relationship.
Statuses: to do, in progress, blocked and done. Display these labels in Spanish.
Standalone tasks must be supported, including ecommerce improvements unrelated to a campaign.

Resource:
A shared link with a title, URL, optional category, optional short description, creator and creation date. It can be linked to any campaign, deliverable or task, or remain a general resource. One resource can be associated with multiple records without being duplicated.
Initial categories: Figma, Drive, document, store, advertising, email and other. Display category labels in Spanish where appropriate.

Primary product requirement: materials must be accessible from the work they belong to.
- Every campaign, publication, newsletter, ad, improvement and task must have a visible "Enlaces y materiales" section and an "Añadir enlace" action. Publications, newsletters and ads are deliverable types; improvements are campaigns or standalone tasks. Do not create extra entity types for them.
- Support multiple links per record, not a single URL field. Example titles: "Texto de Sara", "Diseño de Ainhoa", "Carpeta de campaña", "Landing" and "Campaña en Meta".
- Any member can add a new link or attach an existing resource without leaving the detail view. Only title and URL are required to create a link.
- Allow links to be pinned as primary materials and distinguished from references. Track whether a material requires editorial approval on its association with a deliverable, since the same resource may serve different purposes elsewhere.
- Show each publication's or task's own links first, followed by a separate section for its campaign's links. A task should also show links from its parent deliverable, when applicable. Resolve the campaign through that deliverable when no direct campaign is set. Prevent contradictory campaign relationships.
- Display contextual resources without copying them. Avoid showing the same resource twice and identify the records it is linked to.
- Editing a shared resource affects its linked uses; make that scope clear. Unlinking it from one record must not remove it from any other record. Warn before changes that affect multiple uses.
- Do not make users visit the global library to find a document or design.
- Saving a link does not grant access to the external file. Drive, Figma and other services retain their own permissions.

Add comments and a basic change history to tasks and deliverables. Use explicit database relationships. Do not store the application as one large JSON document or as unrelated text fields.

Keep task due dates separate from publication dates. Completing a task does not mean the deliverable has been published. A campaign can contain multiple deliverables with different dates and channels.

4. MVP screens

Main navigation: "Inicio", "Calendario", "Trabajo", "Campañas" and "Recursos". Put profile and administration in the user menu.

Home:
- My open tasks, ordered by urgency.
- Overdue work.
- Deliverables awaiting review.
- Upcoming publications with owner and status.
- Quick actions to create a task, deliverable or link.
Do not add decorative analytics or invented marketing figures.

Calendar and monthly planning:
- Open planning on the current month. Include month/year selection, previous/next controls and "Hoy".
- Support a monthly calendar, a monthly list and a weekly agenda. These are views of the same records, never monthly folders or copies.
- The monthly list shows date, title, channel, campaign, owner, status and direct access to primary links. Allow users to expand all materials without leaving the list.
- Group publications by week within the month. Provide a separate section for tasks due that month; do not mix task deadlines with publication dates.
- Place deliverables by planned publication date and tasks by due date. Keep actual publication dates separately as execution history.
- Include a campaign when its date range overlaps the selected month or it contains deliverables/tasks scheduled within that month. A campaign can appear in several months while remaining a single record.
- Put undated work in "Sin planificar", accessible from every month. Do not assign work to a month based on when its record or links were created.
- Rescheduling a deliverable moves it to the appropriate month without losing links, comments, tasks or history.
- Filter by person, channel, campaign and status.
- Selecting an item opens its detail view with materials visible.
- Support creating a deliverable from a calendar date and rescheduling through its form.
Do not implement calendar drag-and-drop in the first version.

Work:
- Separate tabs for "Tareas" and "Entregables".
- Tasks have list and kanban views, filters for assignee, status, priority and campaign, and a quick "Mis tareas" filter.
- Provide an accessible control to change status. Drag-and-drop is optional, not required.
- Deliverables have a filterable list and a detail view for brief, copy, links, comments, related tasks and approval.
- Keep forms short. Ask only for essential information at creation and allow details to be added later.

Campaigns:
- List and detail views showing objective, owners, dates, deliverables, tasks and resources.
- Calculate progress from actual records, not manually entered percentages. Make the calculation understandable.
- Support creating an empty campaign or using one initial template for a newsletter campaign.
- The template suggests tasks for Sara, Ainhoa, Maite and Elisa. Let the user confirm assignees and dates before saving. Do not invent deadlines.

Resources:
- One shared link directory with search by title and URL, plus category and campaign filters.
- Members can add links here or within any campaign, deliverable or task. These are the same records, not copies.
- Show who added each resource and where it is used.
- Validate HTTP/HTTPS URLs, warn about duplicates and do not automatically fetch their contents.
- Open external links safely, with appropriate browser protections.

5. Editorial workflow and permissions

Typical workflow: Sara prepares the copy, Ainhoa adds the Figma design, Maite reviews it, and Elisa records scheduling and publication. Each step can have its own task and assignee. The team must be able to work in parallel.

Maite and the ecommerce lead are administrators. Everyone else is a member.
- All members can read shared work, create and edit work, comment and add resources.
- Only administrators manage users, roles, permanent deletion and editorial approval.
- Prefer archiving to deleting related records.
- Members can request review, request changes, and record scheduling/publication when the current revision has been approved.
- Enforce allowed status transitions on the server. Reject unauthorized actions and attempts to bypass review.
- Store who approved the deliverable, when, and which revision was approved.
- Changing copy or a linked editorial material marked as requiring approval invalidates approval. Before publication, return the deliverable to review. Comments, date changes and added reference links do not invalidate approval. Final design links require approval by default.
- Changes to a shared approval-sensitive resource must invalidate approval for all affected deliverables, not just the one currently open.
- Preserve publication history. Editing a published piece creates a new revision requiring review; it must not erase the fact that an earlier version was published.
- External file edits cannot be detected without integrations. Provide a simple "Marcar material actualizado" action that records the update and invalidates affected approvals. Do not imply that an unchanged URL guarantees unchanged content.

This tool tracks work; it does not publish content. "Programado" and "Publicado" are manually recorded statuses. Require a planned publication date when marking an item as scheduled and an actual publication date when marking it as published. Do not simulate connections to Meta, Google, Shopify or an email platform.

6. Brand-specific design and usability

Review Amapola's public website. If available, inspect its styles, logo and screenshots. Identify which visual details you could verify. If access is unavailable, use the proposal below and label it as a proposal. Do not invent official brand colors.

Proposed direction: a warm, craft-oriented editorial workspace with a clear operational interface. Use an ivory background, charcoal text, white surfaces and a restrained poppy/terracotta accent. Use status colors to convey meaning.

Choose highly readable typography for tables and forms. A subtle serif can be used for headings if it fits the brand. Centralize colors, typography, spacing and radii as design tokens.

Use a compact desktop sidebar, a contextual header with the primary action, readable lists and a spacious detail panel. Avoid decorative gradients, oversized cards, excessive shadows and a generic SaaS dashboard appearance.

All user-facing text must be in Spanish as used in Spain. Use the Europe/Madrid time zone, Monday as the first day of the week, and Spanish date formatting. Handle instants, local dates and time zones correctly, including daylight saving time. Do not hard-code UTC offsets.

On mobile, users must be able to check tasks, comment and add links comfortably. Include visible keyboard focus, keyboard navigation, sufficient contrast, form labels, and loading, empty, error and saving states. Confirm destructive actions and warn before discarding unsaved changes.

7. Persistence and security

Access must be private and invitation-only. Disable public sign-up. Provide a secure process to create the initial administrators and invite members. Do not invent team email addresses or use shared passwords.

Enforce server-side authorization and Supabase row-level security. Hiding buttons is not authorization. Unauthenticated users and users outside the workspace must not access its data. Members must not be able to change their own roles.

Provide reproducible migrations, necessary indexes, input validation and bounded queries. Keep privileged keys on the server, document required variables in .env.example, and exclude secrets from the repository.

Use simple optimistic concurrency control for editing forms. If another user has updated the record, warn before overwriting it. Do not implement real-time collaborative editing.

Designs and files remain in Figma and Drive for this version. Store their links and the editorial content needed for coordination. Binary file uploads and third-party API integrations are not required.

8. Demo data and scope boundaries

Provide an optional seed, separate from production and clearly labeled as fictional. Use examples involving photo prints on fabric, wedding gifts and product-page improvements. Do not invent business results, pretend Figma/Drive URLs are real, or create real-looking team email addresses.

Out of scope for the MVP: sales or ROAS dashboards, automatic publication, third-party OAuth integrations, built-in generative AI, chat, work-notification emails, complex automations, budget management, multiple organizations, and Word/Excel importers. Authentication invitation emails are allowed and distinct from work-notification emails.

Do not add features simply because other project management tools have them.

9. Acceptance criteria and delivery

Use automated tests for authorization and critical editorial transitions. Add end-to-end coverage for the main workflow when the environment supports it:
- Create a campaign and a newsletter deliverable.
- Assign copywriting to Sara and design to Ainhoa.
- Save copy and links, add a comment, and request review.
- Approve as Maite, then record scheduling and publication as Elisa.
- Verify calendar placement and persistence after reload.
- Change approved content and verify that a new review is required.
- Verify that a member cannot approve, escalate their role or access workspace data without membership.
- Verify filters, date handling and concurrent-edit warnings.
- Add multiple links to a task, publication and campaign. Verify access from the monthly list and relevant detail views.
- Reuse a resource in two records and unlink it from one without affecting the other.
- Move a publication to the following month and verify that all materials and relationships remain intact.
- Verify a campaign spanning two months and an undated item in "Sin planificar".
- Verify that adding a reference does not invalidate approval, but changing a final design does.
- Verify approval invalidation across shared materials and through "Marcar material actualizado".
- Verify that revising a published item preserves its publication history.

Run the project's linting, type checks, tests and production build. Clearly distinguish verified behavior from checks blocked by unavailable external services. Never claim that an unexecuted test passed.

Deliver the code, migrations, optional seed and a concise README covering installation, configuration, local startup, tests, initial administrator setup and a recommended deployment process. Document database backup and restoration without claiming that backups are already configured.

Finish with a short summary of what was built, which checks ran and which external setup steps remain. Do not describe a primary action with no working behavior, or a workflow that only exists in memory, as complete.
```

## How to use this prompt efficiently

1. Paste it once at the start of the project. If a repository already exists, open it before starting.
2. Give the coding agent access to the intended development environment. Configure secrets through secure environment variables, not by pasting them into the conversation.
3. If image attachments are supported, include a screenshot of the homepage and the logo. These are more useful for visual alignment than repeated vague descriptions.
4. To continue in another session, use: "Read the repository instructions and PROJECT_STATUS.md. Continue with the next unfinished stage without replanning settled decisions."
5. For later changes, request one verifiable outcome at a time. Example: "Add an assignee filter to the calendar using the existing components. Do not redesign the interface or modify unrelated screens. Run the affected tests."

A shorter prompt does not necessarily produce a cheaper build. The main savings come from a fixed scope, code reuse and avoiding late changes to permissions, states and relationships. Token savings are not guaranteed and depend on the model, repository and development environment.
