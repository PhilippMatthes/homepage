from django.views.generic import TemplateView
from projects.models import Event, Project
from weblinks.models import Weblink


class IndexView(TemplateView):
    template_name = 'homepage.html'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['projects'] = Project.objects.all()
        context['weblinks'] = Weblink.objects.order_by('title')
        context['events'] = Event.objects.order_by('-date')
        return context
