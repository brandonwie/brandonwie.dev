<!--
  /contact/+page.svelte — Contact (URL: /contact)

  Thin wrapper. ContactPage is link-only (static, SSG-safe) and reuses the
  contact channels from about.ts links[].
-->
<script lang="ts">
	import ContactPage from '$lib/components/ContactPage.svelte';
</script>

<ContactPage locale="en" />
