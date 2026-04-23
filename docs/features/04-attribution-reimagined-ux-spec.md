# UX Spec: Attribution Reimagined

- **Feature ID:** 4
- **Module:** cost-tracking
- **Status:** Implemented
- **Created:** 2026-04-22
- **Supersedes:** Current implementation (vertical form-heavy layout)

---

## Part I: Audit & Vision

---

## The Verdict: The Engine is Powerful. The UX is Hostile.

The backend is genuinely impressive -- 9 dimensions, 4 match types, priority resolution, auto-discovery, coverage analysis, template system, rule preview. All there. Well-architected.

But the frontend betrays every promise the spec made.

### The 7 Deadly UX Sins

**1. The JSON Textarea** -- The spec says "drag credentials into teams." The implementation asks users to type `{"Team A": ["credId1"], "Team B": ["credId2"]}`. This single field kills the entire "2 minutes to attribution" promise.

**2. Vertical Wall of Everything** -- 8 sections stacked vertically in one ~830-line component. Coverage dashboard, templates, suggestions, summary table, group creation form, group list with inline rule forms, use case gallery, migration. No hierarchy, no flow, no breathing room.

**3. Suggestions You Can't Act On** -- Auto-discovery says "we found a cluster of prod credentials!" Great. Now... manually recreate it yourself. No "Apply" button. Just "Dismiss."

**4. The 8-Column Data Table** -- Raw numbers in a flat table. No visual weight, no storytelling, no at-a-glance insight. Group Name, Type, Entity, Input Tokens, Output Tokens, Cost, Requests, Rule Count. This is a database dump, not a dashboard.

**5. Rule Preview Is Disconnected** -- `previewAttributionRule` exists in the backend. The UI never calls it. You create rules blind.

**6. No Empty State Story** -- New user sees empty forms and empty tables. The spec envisioned guided setup. The implementation says "figure it out."

**7. No Feedback Loops** -- Apply a template? Page reloads. Delete a rule? Hope it worked. Run migration? No inline result. No toasts, no transitions, no confirmation of impact.

---

## The Reimagined Concept

The page needs to transform from a **configuration tool** into a **cost intelligence dashboard** that lets you configure when you're ready.

### Core Principle: Show First, Configure Second

Current: "Here are all the engine's knobs. Turn them."
Reimagined: "Here's what's happening with your money. Want us to organize it?"

### The Three-Zone Layout

**Zone 1 -- The Story (Top Half)**

A split hero section:

Left: **Coverage Ring** -- A bold, animated ring (Apple Activity Ring style) showing attribution percentage. `78% Attributed` in large type. `$11,700 of $15,000` beneath. The gap in the ring is visually prominent -- it's the call to action.

Right: **Unattributed Spend** -- Not a buried table. Each unattributed credential gets a row with its cost, provider badge, and a dropdown: `[Assign to group v]`. One-click assignment right from the coverage view. Close the gap without leaving the dashboard.

Below the hero: **Suggestion Banners** -- Floating, actionable. "3 credentials share the 'prod-' prefix. Create a Production group?" with `[Yes, create it]` and `[Dismiss]`. Clicking Yes creates the group immediately and the card animates away. Not a section to scroll to -- they surface when there's something worth saying.

**Zone 2 -- The Breakdown (Middle)**

**Group Cards, Not Tables** -- Each attribution group rendered as a card:
- Group name (bold) + type badge (colored pill)
- Total cost (large, hero number)
- Proportion bar showing % of total spend
- Credential count
- Click to open detail panel

Cards in a responsive grid. Sortable by cost, name, type. Filterable. At a glance, you see where money goes.

**Zone 3 -- Detailed Management (Panel/Drawer)**

Click a group card -> slide-over panel from the right:
- Group details (editable inline)
- Rules list (with visual indicators: dimension icon + match type + value)
- **Live Rule Builder** -- As you select dimension and type the value, the preview updates: "This rule matches 342 records ($2,450)." Sample values from actual data shown below the input.
- Delete with impact: "Removing this group will unattribute $4,200 in spend."

### The Template Wizard (Not a Form)

When the user clicks `[+ Set Up Attribution]` or when no groups exist (empty state), a full-screen wizard:

**Step 1 -- Intent**: Four large cards with icons. "Track by Team", "Track by Project", "Track by Environment", "Track by Individual". Click one.

**Step 2 -- Name**: Pill-style inputs. Type a name, press Enter, it becomes a pill. Add as many as needed. For environment, pre-filled with Dev/Staging/Production pills (editable).

**Step 3 -- Assign**: Each group becomes a bucket. All credentials listed on the left with provider badge and key hint. Drag into buckets, or click to multi-select. Unassigned credentials highlighted in amber. "3 credentials unassigned" counter.

**Step 4 -- Preview**: Show the groups and rules that will be created. Show cost preview per group. "Engineering will capture $4,200/mo based on current data."

**Step 5 -- Apply**: One button. Success animation. Dashboard populates.

### Empty State: The Invitation

When zero groups exist, the page doesn't show empty forms. Instead:

> **"Know where every dollar goes."**
>
> Set up cost attribution in under 2 minutes. Choose how you want to organize your AI spend.
>
> [Track by Team] [Track by Project] [Track by Environment]
>
> Or let us analyze your data -> [Discover Patterns]

The empty state IS the onboarding. The value proposition is the first thing you see.

### Visual Design Language

- **Generous whitespace** -- every section breathes
- **Bold metrics** -- numbers are the hero, labels are secondary
- **Subtle depth** -- cards with soft shadows, not flat gray boxes
- **Consistent color coding** -- each group type gets a color family (teams: blue, projects: purple, environments: green, etc.)
- **Micro-animations** -- ring fills on load, cards stagger in, transitions between wizard steps
- **Dark mode native** -- designed for both, not bolted on

---

### Wireframe (Desktop)

```
+-------------------------------------------------------------+
|  <- Cost Tracking        Attributions       [+ Set Up]       |
+-------------------------------------------------------------+
|                                                             |
|  +-------------------+    +----------------------------+   |
|  |                   |    |  Unattributed Spend         |   |
|  |    ,------,       |    |                             |   |
|  |   /  78%   \      |    |  sk-...7f42  Anthropic      |   |
|  |  | Attributed|     |    |  $1,800    [Assign to v]   |   |
|  |   \        /      |    |                             |   |
|  |    '------'       |    |  sk-...a1b3  OpenAI         |   |
|  |                   |    |  $1,200    [Assign to v]    |   |
|  |  $11,700 of       |    |                             |   |
|  |  $15,000          |    |  sk-...9c2d  Anthropic      |   |
|  |                   |    |  $300      [Assign to v]    |   |
|  +-------------------+    +----------------------------+   |
|                                                             |
|  +-- Suggestion ----------------------------------------+   |
|  |  3 credentials share "prod-" prefix.                 |   |
|  |  Create a "Production" environment group?            |   |
|  |                         [Create Group]  [Dismiss]    |   |
|  +------------------------------------------------------+   |
|                                                             |
|  Your Groups                        Sort: Cost v  Filter v  |
|  +--------------+ +--------------+ +--------------+       |
|  | Engineering  | |  ML Team     | | Production   |       |
|  | team         | |  team        | | environment  |       |
|  |              | |              | |              |       |
|  |  $4,200      | |  $3,800      | |  $2,100      |       |
|  |  ========..  | |  =======...  | |  =====.....  |       |
|  |  28% . 3 keys| |  25% . 2 keys| |  14% . 4 keys|       |
|  +--------------+ +--------------+ +--------------+       |
|                                                             |
|  +--------------+ +--------------+                         |
|  | Data Science | | Staging      |                         |
|  | team         | | environment  |                         |
|  |              | |              |                         |
|  |  $1,200      | |  $400        |                         |
|  |  ==........  | |  =.........  |                         |
|  |  8% . 1 key  | |  3% . 2 keys |                         |
|  +--------------+ +--------------+                         |
|                                                             |
+-------------------------------------------------------------+
```

---

## Part II: Formal UX Specification

---

## 1. Page States

The attribution page has four mutually exclusive states. The server component determines which state to render based on data availability.

### State Machine

```
                    +------------------+
                    |   LOADING        |
                    |  (loading.tsx)   |
                    +--------+---------+
                             |
              +--------------+--------------+
              |                             |
     data fetch fails                data fetch succeeds
              |                             |
              v                             v
    +---------+---------+     +-------------+-------------+
    |   ERROR           |     |  groups.length === 0?     |
    | (error.tsx)       |     +------+------+-------------+
    +-------------------+            |              |
                                  yes |              | no
                                     v              v
                          +----------+---+  +-------+--------+
                          |  EMPTY STATE |  |  DASHBOARD     |
                          |  (onboarding)|  |  (full view)   |
                          +--------------+  +----------------+
```

### 1.1 Loading State

Skeleton layout matching the dashboard structure:
- Pulsing ring placeholder (left)
- Three skeleton rows (right)
- Three skeleton cards (bottom grid)

No spinners. Structure-preserving skeletons prevent layout shift.

### 1.2 Error State

Full-page error with:
- Error icon + "Something went wrong loading attribution data"
- Retry button (reloads the page)
- Link back to Cost Tracking overview

### 1.3 Empty State (Zero Groups)

Full-page onboarding experience. No forms, no tables, no empty containers.

```
+-------------------------------------------------------------+
|  <- Cost Tracking        Attributions                        |
+-------------------------------------------------------------+
|                                                             |
|                                                             |
|           Know where every dollar goes.                     |
|                                                             |
|     Set up cost attribution in under 2 minutes.             |
|     Choose how you want to organize your AI spend.          |
|                                                             |
|  +----------------+ +----------------+ +----------------+   |
|  |                | |                | |                |   |
|  |   [icon]       | |   [icon]       | |   [icon]       |   |
|  |  Track by Team | | Track by       | | Track by       |   |
|  |                | | Project        | | Environment    |   |
|  |  Group costs   | | Organize by    | | Split dev,     |   |
|  |  by the teams  | | the projects   | | staging, and   |   |
|  |  that use them | | they serve     | | production     |   |
|  |                | |                | |                |   |
|  +----------------+ +----------------+ +----------------+   |
|                                                             |
|              or let us look at your data                     |
|                   [Discover Patterns]                        |
|                                                             |
|                                                             |
|  Already know what you're doing?  [Create group manually]   |
|                                                             |
+-------------------------------------------------------------+
```

**Behavior:**
- Clicking a template card opens the Template Wizard (see Section 4)
- "Discover Patterns" runs auto-discovery and displays suggestion banners
- "Create group manually" scrolls to / reveals the manual group creation form

### 1.4 Dashboard State (Groups Exist)

The full three-zone layout described in Part I. This is the primary view for returning users.

---

## 2. Zone 1: The Story

### 2.1 Coverage Ring

**Data source:** `getAttributionCoverage` use case

**Visual specification:**
- SVG ring, 160px diameter
- Stroke width: 12px
- Attributed arc: `foreground` color (adapts to theme)
- Unattributed arc: `foreground/10` (subtle gap)
- Center text: `{percentage}%` in `text-4xl font-bold tabular-nums`
- Below ring: "Attributed" label in `text-sm text-foreground/60`
- Below label: `${attributedSpend} of ${totalSpend}` in `text-sm text-foreground/40`

**Animation:** On mount, the arc fills from 0 to target percentage over 800ms with ease-out timing.

**Interaction:** Hovering the unattributed arc segment highlights the unattributed spend panel.

**Edge cases:**
- 0% coverage: Ring is fully empty. Text reads "0% Attributed". Unattributed panel shows all credentials.
- 100% coverage: Ring is fully filled. Unattributed panel collapses with a "All spend is attributed" message.
- No usage data: Ring shows "--" instead of percentage. Beneath: "No usage data yet."

### 2.2 Unattributed Spend Panel

**Data source:** `coverage.unattributedBreakdown` array, sorted by cost descending

**Layout:** Right side of hero. Scrollable if >5 items. Max height matches ring container.

**Each row:**
```
+----------------------------------------------------------+
|  [Provider Badge]  credential-label  ....  keyHint       |
|                                           $1,800  2.4%   |
|                                      [Assign to v]       |
+----------------------------------------------------------+
```

**Provider Badge:** Small colored dot + provider name. Colors:
- Anthropic: `orange-500`
- OpenAI: `emerald-500`
- Google: `blue-500`
- Other: `foreground/40`

**Key Hint:** Masked format `**** {last4}` in `font-mono text-foreground/40`

**Assign Dropdown:** Clicking opens a dropdown listing all existing groups + "Create new group..." option.
- Selecting a group fires `createRuleAction` with `dimension: 'credential', matchType: 'exact', matchValue: credentialId, groupId: selectedGroupId`
- After assignment, the row animates out and the coverage ring updates
- "Create new group..." opens a minimal inline form: group name + type, then auto-assigns

**Empty state:** When all credentials are attributed, panel shows:
```
  All spend is attributed.
  Nice work.
```

### 2.3 Suggestion Banners

**Data source:** `getAutoDiscoverySuggestions` use case

**Placement:** Between hero section and group grid. One banner per suggestion. Max 3 visible, "Show N more" link if more exist.

**Banner layout:**
```
+--------------------------------------------------------------+
|  [Confidence dot]  Title text                                |
|  Description text...                                         |
|                                                              |
|  Involves: [cred-1] [cred-2] [cred-3]    [Apply] [Dismiss]  |
+--------------------------------------------------------------+
```

**Confidence dot:**
- High: `emerald-500` (solid)
- Medium: `amber-500` (solid)
- Low: `foreground/30` (outline)

**Credential chips:** Small pills showing credential label + provider badge. Max 5 visible, "+N more" overflow.

**Apply button behavior:**
1. Click "Apply"
2. System creates the group using `suggestedGroupName` and `suggestedGroupType`
3. System creates credential rules for each `credentialId` in the suggestion
4. Banner animates out (slide up + fade)
5. New group card appears in the grid (slide in from left)
6. Coverage ring updates
7. Toast: "Created {groupName} with {N} credential rules"

**Dismiss button behavior:**
1. Click "Dismiss"
2. Fires `dismissSuggestionAction`
3. Banner animates out (fade)
4. Does not reappear on page reload (persistent dismissal)

**No suggestions state:** Section doesn't render at all. No "No suggestions" message -- absence is the message.

---

## 3. Zone 2: The Breakdown

### 3.1 Group Card Grid

**Data source:** `summaryRows` joined with `groups` and `rulesMap`

**Grid layout:**
- Desktop (>=1024px): 3 columns
- Tablet (>=768px): 2 columns
- Mobile (<768px): 1 column
- Gap: 16px

**Controls bar:**
```
Your Groups                              Sort: [Cost v]  [Filter v]
```

**Sort options:** Cost (desc, default), Cost (asc), Name (A-Z), Name (Z-A), Type, Credential count
**Filter options:** All types, Team, Project, Environment, Department, Cost Center, User, Custom

### 3.2 Individual Group Card

```
+------------------------------------------+
|  Engineering                    team      |
|                                           |
|  $4,200                                   |
|  ================..........               |
|  28% of total spend                       |
|                                           |
|  3 credentials  .  4 rules               |
+------------------------------------------+
```

**Card anatomy:**
- **Group name:** `text-lg font-semibold` left-aligned
- **Type badge:** Colored pill, right-aligned. Color map:
  - team: `blue-500/10` bg + `blue-600` text
  - project: `violet-500/10` bg + `violet-600` text
  - environment: `emerald-500/10` bg + `emerald-600` text
  - department: `amber-500/10` bg + `amber-600` text
  - cost_center: `rose-500/10` bg + `rose-600` text
  - business_unit: `sky-500/10` bg + `sky-600` text
  - user: `indigo-500/10` bg + `indigo-600` text
  - custom: `foreground/10` bg + `foreground/60` text
- **Cost:** `text-2xl font-bold tabular-nums` -- the hero of the card
- **Proportion bar:** Full width, 4px height. Filled segment uses group type color. Background: `foreground/10`
- **Percentage:** `text-sm text-foreground/60` below the bar
- **Footer:** `text-xs text-foreground/40` -- credential count + rule count separated by dot

**Card styling:**
- Background: white (light) / `foreground/5` (dark)
- Border: `1px foreground/10`
- Border-radius: 12px
- Padding: 20px
- Shadow: `0 1px 3px rgba(0,0,0,0.04)` (light) / none (dark)
- Hover: `shadow-md` transition, subtle border darken

**Interaction:** Click anywhere on card opens the Group Detail Panel (Section 5).

**Zero-cost group:** Shows `$0.00` with empty proportion bar. Label: "No matched usage yet."

### 3.3 New Group Quick-Add

After the last group card, a dashed-border "add" card:

```
+- - - - - - - - - - - - - - - - - - - - -+
|                                           |
|              [+ icon]                     |
|           Add a group                     |
|                                           |
+- - - - - - - - - - - - - - - - - - - - -+
```

**Click behavior:** Opens the Group Detail Panel in "create" mode (Section 5.3).

---

## 4. Template Wizard

### 4.1 Trigger Points

The wizard can be launched from:
1. Empty state template cards
2. Header `[+ Set Up]` button (dropdown: "Use a template" option)
3. Use Case Gallery action links (if implemented)

### 4.2 Wizard Container

Full-viewport overlay with backdrop blur. Centered content area with max-width 720px.

```
+-------------------------------------------------------------+
| [X Close]                                     Step 2 of 5   |
|                                                             |
|            [=========------]  progress bar                  |
|                                                             |
|  +-------------------------------------------------------+  |
|  |                                                       |  |
|  |              (Step content area)                      |  |
|  |                                                       |  |
|  +-------------------------------------------------------+  |
|                                                             |
|                              [Back]  [Continue ->]          |
+-------------------------------------------------------------+
```

**Progress bar:** 5 segments. Completed: `foreground`. Current: `foreground/60` pulsing. Upcoming: `foreground/10`.

**Close behavior:** Confirmation dialog if any data has been entered: "You haven't finished setting up. Your progress will be lost." [Discard] [Keep editing]

### 4.3 Step 1: Choose Template Type

```
+-------------------------------------------------------+
|                                                       |
|       How do you want to organize your costs?         |
|                                                       |
|  +-------------+  +-------------+  +-------------+   |
|  | [team icon] |  |[project icon]|  | [env icon]  |  |
|  |             |  |             |  |             |   |
|  | By Team     |  | By Project  |  |By Environment| |
|  |             |  |             |  |             |   |
|  | Group costs |  | Organize by |  | Split dev,  |   |
|  | by the team |  | the projects|  | staging, &  |   |
|  | responsible |  | they serve  |  | production  |   |
|  +-------------+  +-------------+  +-------------+   |
|                                                       |
|               +-------------+                         |
|               |[person icon]|                         |
|               |             |                         |
|               |By Individual|                         |
|               |             |                         |
|               |Track spend  |                         |
|               |per person   |                         |
|               +-------------+                         |
|                                                       |
+-------------------------------------------------------+
```

**Card interaction:** Click highlights card (ring border in foreground color). Double-click or "Continue" advances.

**No "Back" button** on Step 1.

### 4.4 Step 2: Name Your Groups

**Dynamic based on template type:**

For `team` / `project` / `individual`:
```
+-------------------------------------------------------+
|                                                       |
|    Name your {teams / projects / individuals}         |
|    Type a name and press Enter to add.                |
|                                                       |
|  +---------------------------------------------------+|
|  | [Engineering x] [ML Team x] [Data Science x]     ||
|  |                                                   ||
|  | [Type a name...                              ]    ||
|  +---------------------------------------------------+|
|                                                       |
|  3 groups will be created                             |
|                                                       |
+-------------------------------------------------------+
```

For `environment`:
```
+-------------------------------------------------------+
|                                                       |
|    Name your environments                             |
|    We've suggested common names. Edit or add more.    |
|                                                       |
|  +---------------------------------------------------+|
|  | [Development x] [Staging x] [Production x]       ||
|  |                                                   ||
|  | [Type a name...                              ]    ||
|  +---------------------------------------------------+|
|                                                       |
|  3 groups will be created                             |
|                                                       |
+-------------------------------------------------------+
```

**Pill behavior:**
- Type text + Enter/comma/tab -> creates pill
- Click X on pill -> removes with shrink animation
- Min 1 pill required to continue

**Validation:**
- Duplicate names: Pill flashes red, not added. Tooltip: "Already added."
- Empty name: Ignored
- Max 20 groups per template application

### 4.5 Step 3: Assign Credentials

```
+-------------------------------------------------------+
|                                                       |
|    Assign credentials to groups                       |
|    Drag credentials or click to assign.               |
|                                                       |
|  Available (3 unassigned)                             |
|  +---------------------------------------------------+|
|  | [Anthropic] sk-prod-main  **** 7f42              ||
|  | [OpenAI]    team-ml-key   **** a1b3              ||
|  | [Anthropic] dev-testing   **** 9c2d              ||
|  +---------------------------------------------------+|
|                                                       |
|  +-------------------+ +-------------------+          |
|  | Engineering       | | ML Team           |          |
|  | Drop here or      | | Drop here or      |          |
|  | click to assign   | | click to assign   |          |
|  |                   | |                   |          |
|  | [Anthropic] sk-.. | | (empty)           |          |
|  | 1 credential      | | 0 credentials     |          |
|  +-------------------+ +-------------------+          |
|                                                       |
|  +-------------------+                                |
|  | Data Science      |                                |
|  | Drop here or      |                                |
|  | click to assign   |                                |
|  |                   |                                |
|  | (empty)           |                                |
|  | 0 credentials     |                                |
|  +-------------------+                                |
|                                                       |
|  [!] 2 credentials still unassigned                   |
|                                                       |
+-------------------------------------------------------+
```

**Available credentials list:**
- Each credential: `[Provider badge] label  **** keyHint`
- Sorted by provider then label
- Draggable (with drag ghost showing credential label)
- Click-to-assign: Click credential -> dropdown appears with group names -> select group -> credential moves to bucket

**Group buckets:**
- One per group from Step 2
- Drop zone with visual feedback (border highlight on dragover)
- Assigned credentials shown as compact pills within the bucket
- Click X on an assigned credential returns it to the "Available" list

**Unassigned counter:** Amber text at bottom. Not blocking -- user can continue with unassigned credentials (they'll appear in the coverage gap).

**Validation:** Same credential cannot be in two groups (enforced by move semantics, not validation).

### 4.6 Step 4: Preview

```
+-------------------------------------------------------+
|                                                       |
|    Here's what we'll create                           |
|                                                       |
|  3 groups with 5 credential rules                     |
|                                                       |
|  +---------------------------------------------------+|
|  | Engineering (team)                  $4,200/mo     ||
|  |   sk-prod-main (Anthropic) -- exact match        ||
|  |   team-backend (OpenAI) -- exact match            ||
|  +---------------------------------------------------+|
|  | ML Team (team)                      $3,800/mo     ||
|  |   team-ml-key (OpenAI) -- exact match             ||
|  +---------------------------------------------------+|
|  | Data Science (team)                 $1,200/mo     ||
|  |   sk-ds-prod (Anthropic) -- exact match           ||
|  |   ds-experiments (Anthropic) -- exact match       ||
|  +---------------------------------------------------+|
|                                                       |
|  Estimated coverage improvement: 67% -> 89%           |
|                                                       |
+-------------------------------------------------------+
```

**Cost preview:** Uses `previewAttributionRule` for each credential assignment to show estimated monthly cost per group.

**Coverage improvement:** Calculated by comparing current coverage % with projected coverage after adding these rules.

**Read-only step.** User reviews and either goes Back to adjust or applies.

### 4.7 Step 5: Apply

Single button: `[Create {N} groups]`

**On click:**
1. Button shows loading spinner
2. Calls `applyTemplateAction` with structured data
3. On success:
   - Wizard closes with slide-down animation
   - Dashboard renders with new groups
   - Toast: "Created {N} groups with {M} rules. {coverage}% of spend is now attributed."
4. On error:
   - Inline error message below button
   - Button re-enabled
   - User can retry or go Back

---

## 5. Group Detail Panel

### 5.1 Panel Container

Slide-over from right edge. Width: 480px (desktop), full-width (mobile).

**Backdrop:** Semi-transparent overlay. Click backdrop to close.

**Header:**
```
+----------------------------------------------+
|  [<- Back to groups]             [X Close]   |
|                                              |
|  Engineering                                 |
|  team                                        |
+----------------------------------------------+
```

### 5.2 Panel Sections

**Section A: Group Info**
```
+----------------------------------------------+
|  Group Details                     [Edit]    |
|                                              |
|  Name:         Engineering                   |
|  Type:         team                          |
|  Description:  Core engineering team costs   |
|  Linked to:    john@company.com              |
|  Slug:         engineering                   |
|  Created:      Apr 15, 2026                  |
+----------------------------------------------+
```

Edit mode: Name and description become inline editable. Type changes via dropdown. Linked entity via principal picker. Save/Cancel buttons appear.

**Section B: Cost Summary**
```
+----------------------------------------------+
|  Cost (Last 30 days)                         |
|                                              |
|  $4,200.00                       28% of total|
|                                              |
|  Input tokens:   2,450,000                   |
|  Output tokens:  890,000                     |
|  Requests:       12,340                      |
+----------------------------------------------+
```

**Section C: Rules**
```
+----------------------------------------------+
|  Rules (4)                       [+ Add]     |
|                                              |
|  +------------------------------------------+|
|  | credential  exact  sk-prod-main          ||
|  | Matches 342 records ($2,450)       [Del] ||
|  +------------------------------------------+|
|  | credential  exact  team-backend          ||
|  | Matches 128 records ($1,200)       [Del] ||
|  +------------------------------------------+|
|  | provider    exact  anthropic             ||
|  | Matches 470 records ($3,650)       [Del] ||
|  +------------------------------------------+|
|  | model_slug  prefix claude-3              ||
|  | Preview unavailable (prefix)       [Del] ||
|  +------------------------------------------+|
|                                              |
+----------------------------------------------+
```

**Rule row anatomy:**
- **Dimension:** Bold, left-aligned
- **Match type:** Muted pill
- **Match value:** `font-mono`
- **Preview line:** Uses `previewAttributionRule` result. Shows "Matches N records ($X)" for exact match. Shows "Preview unavailable ({matchType})" for others.
- **Delete button:** Trash icon, right-aligned. Confirmation: "Remove this rule? This will unattribute any spend matched only by this rule." [Remove] [Cancel]

**Section D: Add Rule (expanded on [+ Add] click)**

```
+----------------------------------------------+
|  New Rule                                    |
|                                              |
|  Dimension:     [credential        v]        |
|  Match type:    [exact             v]        |
|  Value:         [sk-prod-main         ]      |
|                                              |
|  Or pick a credential:                       |
|  [Anthropic - sk-prod-main (**** 7f42)  v]   |
|                                              |
|  Priority:      [0    ]                      |
|                                              |
|  +------------------------------------------+|
|  | LIVE PREVIEW                             ||
|  | This rule matches 342 records ($2,450)   ||
|  | from the last 30 days.                   ||
|  |                                          ||
|  | Sample values in your data:              ||
|  | sk-prod-main, sk-prod-backup,            ||
|  | sk-staging-1                             ||
|  +------------------------------------------+|
|                                              |
|  [Cancel]                    [Add Rule]      |
+----------------------------------------------+
```

**Live preview behavior:**
- Debounced (300ms after last keystroke)
- Calls `previewAttributionRule` server action
- Shows loading skeleton while fetching
- Updates match count + cost on every change
- Shows sample dimension values from actual data (helps catch typos)
- For `credential` dimension with `exact` match: credential picker dropdown appears and takes precedence
- Red warning if 0 matches: "This rule matches nothing. Check the value -- here are actual values in your data: [list]"

### 5.3 Panel in "Create" Mode

When opened from the "Add a group" card, the panel shows:

```
+----------------------------------------------+
|  [<- Cancel]                     [X Close]   |
|                                              |
|  New Group                                   |
|                                              |
|  Name:         [                        ]    |
|  Type:         [team                   v]    |
|  Description:  [                        ]    |
|  Link to:      [Select a person...     v]    |
|                                              |
|  [Create Group]                              |
+----------------------------------------------+
```

After creation, panel transitions to the standard view (Section 5.2) for the newly created group, allowing immediate rule addition.

---

## 6. Destructive Actions

All destructive actions require confirmation and show impact.

### 6.1 Delete Group

**Trigger:** Three-dot menu in panel header -> "Delete group"

**Confirmation dialog:**
```
+------------------------------------------+
|  Delete "Engineering"?                   |
|                                          |
|  This will remove the group and all      |
|  4 associated rules. $4,200 in spend     |
|  will become unattributed.               |
|                                          |
|  This action cannot be undone.           |
|                                          |
|  [Cancel]              [Delete Group]    |
+------------------------------------------+
```

**Delete button:** Red/destructive styling. On click: panel closes, card animates out of grid, coverage ring updates, toast: "Deleted Engineering and 4 rules."

### 6.2 Delete Rule

**Trigger:** Trash icon on rule row.

**Inline confirmation:** Rule row expands to show: "Remove this rule?" [Remove] [Cancel]. No full dialog -- inline is sufficient for single rules.

### 6.3 Dismiss Suggestion

No confirmation needed. Low stakes, reversible (suggestions reappear if underlying data matches).

---

## 7. Responsive Behavior

### Desktop (>=1024px)
- Hero: Two-column (ring left, unattributed right)
- Group grid: 3 columns
- Detail panel: Slide-over from right, 480px width

### Tablet (768px - 1023px)
- Hero: Two-column (narrower, ring shrinks to 120px)
- Group grid: 2 columns
- Detail panel: Slide-over, 400px width

### Mobile (<768px)
- Hero: Stacked (ring on top, unattributed below with horizontal scroll)
- Group grid: 1 column (full-width cards)
- Detail panel: Full-screen overlay (no slide-over)
- Template wizard: Full-screen (already is)

---

## 8. Component Inventory

### Server Components (No client state)

| Component | Location | Props | Renders |
|-----------|----------|-------|---------|
| `AttributionDashboard` | `_components/` | Full data payload from page.tsx | Orchestrates all zones. Chooses empty vs dashboard state. |
| `CoverageRing` | `_components/` | `percentage, attributedSpend, totalSpend` | SVG ring with animated fill |
| `UnattributedPanel` | `_components/` | `breakdown[], groups[], assignAction` | Scrollable credential list with assign dropdowns |
| `SuggestionBanner` | `_components/` | `suggestion, applyAction, dismissAction` | Single actionable suggestion card |
| `GroupCard` | `_components/` | `group, summary, ruleCount` | Individual group card in the grid |
| `GroupGrid` | `_components/` | `groups[], summaryRows[], rulesMap` | Grid container with sort/filter controls |
| `EmptyState` | `_components/` | `onTemplateSelect` | Onboarding layout with template cards |

### Client Components (Interactive state required)

| Component | Location | Why Client | Props |
|-----------|----------|------------|-------|
| `TemplateWizard` | `_containers/` | Multi-step state, drag-and-drop, dynamic inputs | `credentials[], users[], templateType, applyAction` |
| `GroupDetailPanel` | `_containers/` | Slide-over open/close state, inline editing, live rule preview | `group, rules[], summary, credentials[], actions{}` |
| `RuleBuilder` | `_containers/` | Live preview with debounced server action calls | `groupId, credentials[], previewAction, createAction` |
| `CredentialAssigner` | `_containers/` | Drag-and-drop credential assignment in wizard | `credentials[], groups[], onChange` |
| `PillInput` | `_containers/` | Dynamic add/remove pill state | `pills[], onChange, placeholder` |
| `AssignDropdown` | `_containers/` | Dropdown open/close state | `groups[], onAssign, credential` |

### Shared Patterns (From existing design system)

| Pattern | Usage |
|---------|-------|
| Provider badge (colored dot + name) | Credential rows, card footers |
| Type badge (colored pill) | Group cards, panel header |
| Tabular numbers (`tabular-nums`) | All cost/metric displays |
| Skeleton loading | All data-dependent sections |
| Toast notifications | Post-mutation feedback |
| Confirmation dialog | Destructive actions |

---

## 9. Server Action Mapping

### Existing Actions (Reused)

| Action | Used By |
|--------|---------|
| `createGroupAction` | GroupDetailPanel (create mode) |
| `deleteGroupAction` | GroupDetailPanel (delete confirmation) |
| `createRuleAction` | RuleBuilder, UnattributedPanel (assign) |
| `deleteRuleAction` | GroupDetailPanel (rule delete) |
| `applyTemplateAction` | TemplateWizard (Step 5) |
| `dismissSuggestionAction` | SuggestionBanner |

### New Actions Required

| Action | Purpose | Calls Use Case |
|--------|---------|----------------|
| `updateGroupAction` | Inline group editing in panel | `updateAttributionGroup` |
| `previewRuleAction` | Live rule preview in RuleBuilder | `previewAttributionRule` |
| `applySuggestionAction` | One-click suggestion apply | `createAttributionGroup` + `createAttributionRule` (batch) |
| `assignCredentialAction` | Quick-assign from unattributed panel | `createAttributionRule` (single credential rule) |

### Action Flow: Apply Suggestion

```
User clicks [Apply] on suggestion banner
  -> applySuggestionAction(suggestion)
    -> createAttributionGroup({
         displayName: suggestion.suggestedGroupName,
         groupType: suggestion.suggestedGroupType
       })
    -> for each credentialId in suggestion.credentialIds:
         createAttributionRule({
           groupId: newGroup.id,
           dimension: 'credential',
           matchType: 'exact',
           matchValue: credentialId
         })
    -> revalidatePath('/cost-tracking/attributions')
  -> Banner animates out
  -> Dashboard updates with new group
```

---

## 10. Animation & Transition Spec

| Element | Trigger | Animation | Duration | Easing |
|---------|---------|-----------|----------|--------|
| Coverage ring fill | Page load | Arc grows from 0 to target | 800ms | ease-out |
| Group cards | Page load | Stagger fade-in from bottom | 300ms each, 50ms stagger | ease-out |
| Suggestion banner dismiss | Dismiss click | Slide up + fade out | 200ms | ease-in |
| Suggestion banner apply | Apply click | Slide up + green flash | 300ms | ease-out |
| Group card appear (after create) | Mutation success | Scale from 0.95 + fade in | 250ms | spring |
| Group card disappear (after delete) | Mutation success | Scale to 0.95 + fade out | 200ms | ease-in |
| Detail panel open | Card click | Slide from right + backdrop fade | 250ms | ease-out |
| Detail panel close | Close/backdrop click | Slide to right + backdrop fade | 200ms | ease-in |
| Credential move (wizard) | Drag-drop or click-assign | Element moves to bucket position | 200ms | spring |
| Wizard step transition | Continue/Back | Content cross-fade | 200ms | ease-in-out |
| Live preview update | Debounced input | Skeleton -> content fade | 150ms | ease-out |
| Toast appear | Post-mutation | Slide up from bottom | 250ms | spring |
| Toast dismiss | Auto (4s) or click | Fade out | 150ms | ease-in |

---

## 11. Accessibility

- All interactive elements keyboard-navigable (Tab order follows visual order)
- Coverage ring has `aria-label`: "Attribution coverage: {N}% of spend attributed"
- Group cards have `role="button"` and `aria-label`: "{groupName}, {cost}, {percentage} of total"
- Template wizard steps announced via `aria-live="polite"` region
- Drag-and-drop has keyboard alternative (click-to-assign dropdown)
- Confirmation dialogs trap focus
- Slide-over panel traps focus when open, returns focus to trigger on close
- Color coding never sole indicator -- always paired with text labels
- Meets WCAG 2.1 AA contrast ratios in both light and dark mode

---

## 12. Migration from Current UI

The reimagined UI replaces the current `AttributionsView.tsx` entirely. No incremental migration -- the component is rewritten.

**What's preserved:**
- All server actions (reused, new ones added)
- All use cases (reused, no changes)
- Page.tsx data fetching (minimal changes -- add `previewRule` action prop)
- Domain logic (unchanged)

**What's replaced:**
- `AttributionsView.tsx` -> `AttributionDashboard` (server) + client containers
- Inline forms -> `GroupDetailPanel` + `RuleBuilder` containers
- Template forms -> `TemplateWizard` container
- Summary table -> `GroupGrid` + `GroupCard` components
- Coverage section -> `CoverageRing` + `UnattributedPanel` components

**What's new:**
- `EmptyState` component
- `SuggestionBanner` component (actionable, not just informational)
- `AssignDropdown` component
- `PillInput` component
- `CredentialAssigner` component
- Toast notification system (if not already project-wide)

**Data layer changes:**
- `updateGroupAction` added to `actions.ts`
- `previewRuleAction` added to `actions.ts`
- `applySuggestionAction` added to `actions.ts`
- `assignCredentialAction` added to `actions.ts`
- Page.tsx passes new actions as props

---

## 13. Open Design Decisions

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | Credential assignment in wizard: drag-and-drop vs multi-select? | DnD is more intuitive but adds complexity. Multi-select is simpler but less visual. | **Both.** Click-to-assign as primary, DnD as enhancement. DnD can be a progressive enhancement -- works without JS for the click path. |
| 2 | Coverage ring: SVG ring vs CSS conic-gradient? | SVG is more controllable (animation, segments). CSS is simpler. | **SVG.** Need animation control and segment hover interaction. |
| 3 | Should the empty state show auto-discovery results inline? | Could run discovery on load and show suggestions alongside template cards. | **Yes, if available.** If discoveries exist, show a "Based on your data" section below template cards. |
| 4 | Group detail panel vs dedicated sub-route? | Panel keeps context (see grid behind). Sub-route gives more space. | **Panel.** Context preservation is more valuable. Mobile falls back to full-screen anyway. |
| 5 | Should we show cost sparklines on group cards? | Adds trend info at a glance but needs time-series data per group (not yet available). | **Defer.** Current backend returns point-in-time aggregates. Add sparklines when time-series attribution is implemented. |
| 6 | Toast system: build or use existing? | Check if project has a toast/notification system. If not, need one. | **Check project.** If none exists, add a minimal one (client context + portal). This is a project-wide concern, not attribution-specific. |
