package app.noma.notes;

/** Placement-time configuration for the Focus widget (defaults: automatic). */
public class NomaFocusWidgetConfigureActivity extends NomaWidgetConfigureActivity {
    @Override
    protected String defaultConfigJson() {
        return "{\"noteId\":null}";
    }
}
