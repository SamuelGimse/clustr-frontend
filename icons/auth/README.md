# Sign-in provider marks

- `google.svg`: unmodified light/pill icon from Google's [pre-approved sign-in assets](https://developers.google.com/static/identity/images/signin-assets.zip), Android + Web SVG, no text. The standard colored G is kept on white, per [Google's branding guidance](https://developers.google.com/identity/branding-guidelines).
- `facebook.svg`: Facebook brand mark from [Simple Icons](https://github.com/simple-icons/simple-icons/blob/develop/icons/facebook.svg), rendered locally as a single-color mask. Simple Icons is CC0; Facebook's trademark remains its owner's property.

Both icons are decorative inside buttons with visible provider names. Loading these assets does not contact the providers; the existing OAuth action is unchanged.
