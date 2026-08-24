import { createLibrary } from "@/packages/engine";

// Layout
import { Stack }     from "./layout/stack";
import { Grid }      from "./layout/grid";
import { Card }      from "./layout/card";
import { Tabs }      from "./layout/tabs";
import { Accordion } from "./layout/accordion";
import { Separator } from "./layout/separator";

// Content
import { Text }     from "./content/text";
import { Markdown } from "./content/markdown";
import { Image }    from "./content/image";
import { Callout }  from "./content/callout";

// Charts
import { BarChart }    from "./charts/bar-chart";
import { LineChart }   from "./charts/line-chart";
import { PieChart }    from "./charts/pie-chart";
import { AreaChart }   from "./charts/area-chart";
import { RadarChart }  from "./charts/radar-chart";
import { RadialChart } from "./charts/radial-chart";
import { FunnelChart } from "./charts/funnel-chart";
import { SankeyChart } from "./charts/sankey-chart";

// Actions
import { Button }      from "./actions/button";
import { ButtonGroup } from "./actions/button-group";

// Data
import { Table }   from "./data/table";
import { Heatmap } from "./data/heatmap";
import { Tag }     from "./data/tag";

// Forms
import { Input }         from "./forms/input";
import { Textarea }      from "./forms/textarea";
import { Select }        from "./forms/select";
import { Slider }        from "./forms/slider";
import { CheckboxGroup } from "./forms/checkbox-group";
import { RadioGroup }    from "./forms/radio-group";

export const morphicLibrary = createLibrary({
  root: "Stack",
  components: [
    // Layout
    Stack, Grid, Card, Tabs, Accordion, Separator,
    // Content
    Text, Markdown, Image, Callout,
    // Charts
    BarChart, LineChart, PieChart, AreaChart, RadarChart, RadialChart, FunnelChart, SankeyChart,
    // Actions
    Button, ButtonGroup,
    // Data
    Table, Heatmap, Tag,
    // Forms
    Input, Textarea, Select, Slider, CheckboxGroup, RadioGroup,
  ],
});
