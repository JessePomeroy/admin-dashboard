<script lang="ts">
import {protectDraftNavigation} from "../src/lib/pages/editor/draftNavigation";
let pending=$state(true);protectDraftNavigation(()=>pending);
</script>
<button onclick={()=>pending=false}>saved</button>
