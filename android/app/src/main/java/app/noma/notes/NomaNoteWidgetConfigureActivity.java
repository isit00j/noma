package app.noma.notes;

/** Placement-time configuration for the Note widget (defaults: recent notes). */
public class NomaNoteWidgetConfigureActivity extends NomaWidgetConfigureActivity {
    @Override
    protected String defaultConfigJson() {
        return "{\"source\":\"recent\",\"folderId\":null,\"tagId\":null,\"maxItems\":3}";
    }
}
