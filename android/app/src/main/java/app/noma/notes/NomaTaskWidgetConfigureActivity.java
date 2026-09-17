package app.noma.notes;

/** Placement-time configuration for the Task widget (defaults: today's tasks). */
public class NomaTaskWidgetConfigureActivity extends NomaWidgetConfigureActivity {
    @Override
    protected String defaultConfigJson() {
        return "{\"view\":\"today\",\"listId\":null,\"maxItems\":5}";
    }
}
