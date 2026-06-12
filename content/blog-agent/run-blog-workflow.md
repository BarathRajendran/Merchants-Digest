# Run Blog Workflow

This file defines the canonical behavior for the command:

`Run blog`

## Intent

Execute the weekly Merchants Digest content cycle with zero manual intervention unless a real blocker appears.

## Default output

- 2 blog posts
- scheduled for the next Tuesday and Thursday
- merchant-relevant topics selected from current trends
- SEO/AEO-aware structure
- full draft JSON
- preview HTML
- image brief
- final cover asset
- queued manifest entries

## Topic selection rules

Choose topics that satisfy all of the following:
- timely or currently strengthening in relevance
- useful to Shopify merchants within the next 1 to 4 weeks
- answerable in a practical, operator-focused article
- likely to benefit from search and answer-engine visibility
- relatable to day-to-day store decisions

Prefer topics around:
- AI-assisted commerce and discovery
- product page clarity
- trust and conversion
- shipping, returns, and sizing communication
- merchandising and catalog structure
- buyer intent and traffic quality
- retention and repeat purchase operations

Avoid topics that are:
- too broad
- purely news recaps
- too speculative
- dependent on weak or unverified claims

## Draft quality gates

A draft is acceptable only if:
- the opening problem is immediately recognizable to a merchant
- the article sounds human and grounded
- headings are useful and specific
- there is no obvious filler or generic advice
- the piece has a clear operational takeaway

## Image quality gates

An image is acceptable only if:
- it fits one of the approved archetypes
- the text fits safely with no clipping
- the composition still works at thumbnail size
- the scene feels believable and editorial
- it does not obviously look machine-generated

If the image fails these rules, regenerate or redesign before considering the workflow complete.

## Queue behavior

By default:
- create queued entries as `approved`
- do not publish immediately
- set `publishDate` and `scheduledDate`
- keep the live site unchanged until release

## Release behavior

Only publish queued content when:
- the user explicitly asks to release, or
- the scheduled release workflow is invoked
