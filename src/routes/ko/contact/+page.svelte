<!--
  /ko/contact/+page.svelte — Korean Contact (URL: /ko/contact)

  Thin wrapper. ContactPage reads the Korean links[] from about.ts — real KO
  parity, no fallback banner.
-->
<script lang="ts">
	import ContactPage from '$lib/components/ContactPage.svelte';
</script>

<ContactPage locale="ko" />
