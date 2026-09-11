<script lang="ts">
  import { CALENDAR_COPY } from '$lib/copy'
</script>

<ul class="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-gray-500">
  <li class="flex items-center gap-1.5">
    <span class="inline-block h-3 w-2 rounded-sm bg-blue-500"></span>
    <span class="inline-block h-3 w-2 rounded-sm bg-blue-300"></span>
    {CALENDAR_COPY.rain.toLowerCase()}, {CALENDAR_COPY.observed} / {CALENDAR_COPY.forecast}
  </li>
  <li class="flex items-center gap-1.5">
    <svg width="14" height="8" aria-hidden="true"
      ><line x1="0" y1="4" x2="14" y2="4" stroke="#ef4444" stroke-width="1.5" /></svg
    >
    {CALENDAR_COPY.temp.toLowerCase()}
  </li>
  <li class="flex items-center gap-1.5">
    <svg width="8" height="8" aria-hidden="true">
      <g stroke="#0891b2" stroke-width="1" stroke-linecap="round">
        <line x1="4" y1="1" x2="4" y2="7" />
        <line x1="1.4" y1="2.5" x2="6.6" y2="5.5" />
        <line x1="1.4" y1="5.5" x2="6.6" y2="2.5" />
      </g>
    </svg>
    {CALENDAR_COPY.frost}
  </li>
  <li class="flex items-center gap-1.5">
    <svg width="26" height="8" aria-hidden="true">
      <path d="M1 7 l4 -5 l4 5 z" fill="#7c3aed" />
      <path d="M9 7 l4 -5 l4 5 z" fill="#0d9488" />
      <path d="M17 7 l4 -5 l4 5 z" fill="#db2777" />
    </svg>
    {CALENDAR_COPY.trigger}, {CALENDAR_COPY.triggerColors}
  </li>
  <li class="flex items-center gap-1.5">
    <svg width="28" height="12" aria-hidden="true">
      <path d="M2 10 Q 10 -6 18 10" fill="none" stroke="#374151" stroke-width="1.2" />
      <path d="M18 6 v4 H27 v-4" fill="none" stroke="#374151" stroke-width="1.5" />
    </svg>
    {CALENDAR_COPY.peakWindow}
  </li>
  <li class="flex items-center gap-1.5">
    <span class="inline-block h-2.5 w-3 rounded-sm bg-green-600"></span>{CALENDAR_COPY.scoreGood}
    <span class="ml-1 inline-block h-2.5 w-3 rounded-sm bg-amber-500"></span>{CALENDAR_COPY.scoreOk}
    <span class="ml-1 inline-block h-2.5 w-3 rounded-sm bg-gray-300"></span>{CALENDAR_COPY.scorePoor}
  </li>
  <li class="flex items-center gap-1.5">
    <svg width="14" height="12" aria-hidden="true">
      <defs>
        <pattern id="legend-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="4" stroke="#cbd5e1" stroke-width="1" />
        </pattern>
      </defs>
      <rect width="14" height="12" fill="url(#legend-hatch)" stroke="#e5e7eb" />
    </svg>
    {CALENDAR_COPY.projection}
  </li>
</ul>
